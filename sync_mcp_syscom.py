import os
import sys
import json
import logging
import argparse
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
import pandas as pd

# Configuración de logs
logging.basicConfig(
    filename='sync_syscom.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    encoding='utf-8'
)

def safe_filename(name):
    """Normaliza números de parte a nombres de archivo seguros para Windows/Linux."""
    return str(name).replace('/', '-').replace('\\', '-').strip()

def cargar_configuracion():
    """Carga configuración desde config.env si existe."""
    config = {
        'SYSCOM_CLIENT_ID': '',
        'SYSCOM_CLIENT_SECRET': '',
        'SYSCOM_MCP_ENDPOINT': 'http://localhost:8000/v1',
        'SYSCOM_MCP_API_KEY': '',
        'DOWNLOAD_IMAGES': True,
        'DOWNLOAD_DATASHEETS': True
    }
    
    if os.path.exists('config.env'):
        with open('config.env', 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k in ['DOWNLOAD_IMAGES', 'DOWNLOAD_DATASHEETS']:
                        config[k] = (v.lower() == 'true')
                    else:
                        config[k] = v
    return config

class SyscomOAuthClient:
    """Cliente oficial para la API REST de Syscom (developers.syscom.mx)."""
    
    def __init__(self, client_id, client_secret):
        self.client_id = client_id
        self.client_secret = client_secret
        self.token = None
        self.token_expiry = datetime.now()
        self.base_url = "https://developers.syscom.mx/api/v1"

    def autenticar(self):
        """Solicita o renueva el Bearer Token mediante Client Credentials."""
        if not self.client_id or not self.client_secret or 'tu_client_id' in self.client_id:
            return False
            
        if self.token and datetime.now() < self.token_expiry:
            return True

        url = "https://developers.syscom.mx/oauth/token"
        data = urllib.parse.urlencode({
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'grant_type': 'client_credentials'
        }).encode('utf-8')

        try:
            req = urllib.request.Request(url, data=data, method='POST')
            req.add_header('Content-Type', 'application/x-www-form-urlencoded')
            req.add_header('User-Agent', 'Bitmovil-Catalog-Sync/2.0')
            
            with urllib.request.urlopen(req, timeout=12) as resp:
                if resp.status == 200:
                    res = json.loads(resp.read().decode('utf-8'))
                    self.token = res.get('access_token')
                    expires_in = int(res.get('expires_in', 3600))
                    self.token_expiry = datetime.now() + timedelta(seconds=expires_in - 60)
                    logging.info("Token OAuth2 de Syscom obtenido exitosamente.")
                    return True
        except Exception as e:
            logging.error(f"Error autenticando con Syscom OAuth2: {e}")
        return False

    def buscar_producto(self, modelo):
        """Consulta un producto por modelo y retorna URLs de foto y ficha."""
        if not self.autenticar():
            return None

        url = f"{self.base_url}/productos?busqueda={urllib.parse.quote(modelo)}"
        req = urllib.request.Request(url)
        req.add_header('Authorization', f"Bearer {self.token}")
        req.add_header('User-Agent', 'Bitmovil-Catalog-Sync/2.0')

        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode('utf-8'))
                    productos = data.get('productos', [])
                    if productos:
                        p = productos[0]
                        img = p.get('img_portada') or (p.get('imagenes') and p['imagenes'][0])
                        ficha = p.get('link_privado') or (p.get('recursos') and p['recursos'][0].get('path'))
                        return {
                            'imagen_url': img,
                            'ficha_url': ficha
                        }
        except Exception as e:
            logging.warning(f"Error consultando producto {modelo} en Syscom: {e}")
        return None

def descargar_con_mime(url, dir_destino, base_nombre):
    """
    Descarga un archivo remoto detectando la extensión real según la cabecera Content-Type.
    Retorna la ruta final guardada o None.
    """
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            content_type = resp.headers.get('Content-Type', '').lower()
            
            # Determinar extensión correcta
            ext = '.jpg'
            if 'image/png' in content_type: ext = '.png'
            elif 'image/avif' in content_type: ext = '.avif'
            elif 'image/webp' in content_type: ext = '.webp'
            elif 'application/pdf' in content_type: ext = '.pdf'
            elif url.lower().endswith('.pdf'): ext = '.pdf'
            elif url.lower().endswith('.png'): ext = '.png'
            
            ruta_final = os.path.join(dir_destino, f"{base_nombre}{ext}")
            with open(ruta_final, 'wb') as f:
                f.write(resp.read())
            return ruta_final
    except Exception as e:
        logging.error(f"Error descargando {url}: {e}")
    return None

def sincronizar_catalogo(dry_run=False):
    print("=" * 65)
    print("SINCRONIZADOR DE RECURSOS SYSCOM / MCP — BITMOVIL")
    print("=" * 65)

    config = cargar_configuracion()
    excel_path = 'Portafolio_Articulos_por_Linea.xlsx'
    img_dir = 'web/imagenes'
    doc_dir = 'web/fichas_tecnicas'

    os.makedirs(img_dir, exist_ok=True)
    os.makedirs(doc_dir, exist_ok=True)

    if not os.path.exists(excel_path):
        print(f"Error: No se encontró el archivo {excel_path}")
        return

    df = pd.read_excel(excel_path, sheet_name='Lista (filtrable)')
    df = df.fillna('')

    # Desduplicación correcta de productos
    modelos_unicos = [str(m).strip() for m in df['No. de Parte'].dropna().unique() if str(m).strip()]
    total = len(modelos_unicos)

    con_foto = 0
    con_ficha = 0
    pendientes = []

    for modelo in modelos_unicos:
        s_name = safe_filename(modelo)
        tiene_foto = any(os.path.exists(os.path.join(img_dir, s_name + ext)) for ext in ['.png', '.jpg', '.jpeg', '.avif', '.webp'])
        tiene_ficha = os.path.exists(os.path.join(doc_dir, s_name + '.pdf'))

        if tiene_foto: con_foto += 1
        if tiene_ficha: con_ficha += 1

        if not tiene_foto or not tiene_ficha:
            pendientes.append(modelo)

    print(f"\nEstado actual del catálogo ({total} productos únicos):")
    print(f"  • Con fotografía:    {con_foto} / {total} (Faltan {total - con_foto})")
    print(f"  • Con ficha técnica: {con_ficha} / {total} (Faltan {total - con_ficha})")

    if dry_run:
        print("\n[MODO SIMULADOR ACTIVADO (--dry-run)]")
        if not config['SYSCOM_CLIENT_ID'] or 'tu_client' in config['SYSCOM_CLIENT_ID']:
            print("AVISO: No se han configurado credenciales reales de Syscom en 'config.env'.")
        else:
            print("Credenciales de Syscom detectadas.")
        print("Fin de la simulación. Ningún archivo fue descargado.")
        return

    # Verificar credenciales
    client = SyscomOAuthClient(config['SYSCOM_CLIENT_ID'], config['SYSCOM_CLIENT_SECRET'])
    if not client.autenticar():
        print("\n" + "!" * 65)
        print("AVISO PARA EL ADMINISTRADOR:")
        print("Para descargar automáticamente las fotos y fichas oficiales de Syscom,")
        print("configura tu SYSCOM_CLIENT_ID y SYSCOM_CLIENT_SECRET en 'config.env'.")
        print("!" * 65)
        return

    print(f"\nIniciando descarga de recursos para {len(pendientes)} modelos pendientes...")
    nuevas_fotos = 0
    nuevas_fichas = 0

    for i, modelo in enumerate(pendientes, 1):
        s_name = safe_filename(modelo)
        print(f"[{i}/{len(pendientes)}] Consultando {modelo}...", end=' ')

        res = client.buscar_producto(modelo)
        if res:
            if config['DOWNLOAD_IMAGES'] and res.get('imagen_url'):
                if not any(os.path.exists(os.path.join(img_dir, s_name + ext)) for ext in ['.png', '.jpg', '.jpeg', '.avif', '.webp']):
                    if descargar_con_mime(res['imagen_url'], img_dir, s_name):
                        nuevas_fotos += 1
                        print("Foto OK", end=' | ')

            if config['DOWNLOAD_DATASHEETS'] and res.get('ficha_url'):
                if not os.path.exists(os.path.join(doc_dir, s_name + '.pdf')):
                    if descargar_con_mime(res['ficha_url'], doc_dir, s_name):
                        nuevas_fichas += 1
                        print("Ficha OK", end=' ')
            print("")
        else:
            print("No encontrado.")

    print("\n" + "=" * 65)
    print(f"Sincronización finalizada. Nuevas fotos: {nuevas_fotos} | Nuevas fichas: {nuevas_fichas}")
    print("=" * 65)

    # Actualizar base de datos web
    try:
        import actualizar_web
        actualizar_web.actualizar()
    except Exception as e:
        print(f"Error actualizando web: {e}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Sincronizador de recursos Syscom")
    parser.add_argument('--dry-run', action='store_true', help="Ejecutar en modo simulación")
    args = parser.parse_args()

    sincronizar_catalogo(dry_run=args.dry_run)
