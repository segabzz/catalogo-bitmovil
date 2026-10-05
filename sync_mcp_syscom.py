import os
import sys
import json
import logging
import argparse
import urllib.request
import urllib.parse
import pandas as pd

# Configurar logging
logging.basicConfig(
    filename='sync_syscom.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    encoding='utf-8'
)

def safe_filename(name):
    """Convierte números de parte con caracteres no permitidos a nombres seguros."""
    return str(name).replace('/', '-').strip()

def cargar_configuracion():
    """Carga variables desde config.env si existe."""
    config = {
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

def consultar_mcp_syscom(no_parte, endpoint, api_key):
    """
    Consulta el MCP o servicio de Syscom del administrador.
    Soporta formato REST estándar o llamada MCP JSON-RPC.
    Retorna un diccionario con 'imagen_url' y 'ficha_url' si están disponibles.
    """
    if not endpoint or 'tu_token' in api_key or endpoint == 'http://localhost:8000/v1':
        return None
    
    try:
        # Construcción de la consulta al endpoint configurado
        url = f"{endpoint.rstrip('/')}/producto?modelo={urllib.parse.quote(no_parte)}"
        headers = {
            'User-Agent': 'Bitmovil-Catalog-Sync/1.0',
            'Accept': 'application/json'
        }
        if api_key:
            headers['Authorization'] = f"Bearer {api_key}"
            
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode('utf-8'))
                # Extraer URLs según estructura común de Syscom / MCP
                imagen_url = data.get('imagen_portada') or data.get('imagen') or (data.get('imagenes') and data['imagenes'][0])
                ficha_url = data.get('ficha_tecnica') or data.get('pdf') or (data.get('recursos') and data['recursos'][0].get('path'))
                return {
                    'imagen_url': imagen_url,
                    'ficha_url': ficha_url
                }
    except Exception as e:
        logging.warning(f"No se pudo consultar el MCP para {no_parte}: {e}")
        
    return None

def descargar_archivo(url, destino):
    """Descarga un archivo remoto a la ruta especificada."""
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as response, open(destino, 'wb') as out_file:
            out_file.write(response.read())
        return True
    except Exception as e:
        logging.error(f"Error descargando {url} -> {destino}: {e}")
        return False

def sincronizar_catalogo(dry_run=False):
    print("=" * 60)
    print("SINCRONIZADOR DE RECURSOS CON MCP DE SYSCOM — BITMOVIL")
    print("=" * 60)
    
    config = cargar_configuracion()
    endpoint = config['SYSCOM_MCP_ENDPOINT']
    api_key = config['SYSCOM_MCP_API_KEY']
    
    excel_path = 'Portafolio_Articulos_por_Linea.xlsx'
    img_dir = 'web/imagenes'
    doc_dir = 'web/fichas_tecnicas'
    
    os.makedirs(img_dir, exist_ok=True)
    os.makedirs(doc_dir, exist_ok=True)
    
    if not os.path.exists(excel_path):
        print(f"Error: No se encontró el archivo {excel_path}")
        return
        
    print(f"Leyendo base de datos: {excel_path}")
    df = pd.read_excel(excel_path, sheet_name='Lista (filtrable)')
    df = df.fillna('')
    
    total = len(df)
    con_foto = 0
    con_ficha = 0
    pendientes_foto = []
    pendientes_ficha = []
    
    for _, row in df.iterrows():
        no_parte = str(row.get('No. de Parte', '')).strip()
        if not no_parte:
            continue
            
        s_name = safe_filename(no_parte)
        
        # Verificar imagen existente
        tiene_foto = any(os.path.exists(os.path.join(img_dir, s_name + ext)) for ext in ['.png', '.jpg', '.jpeg', '.avif', '.webp'])
        if tiene_foto:
            con_foto += 1
        else:
            pendientes_foto.append(no_parte)
            
        # Verificar ficha técnica existente
        tiene_doc = os.path.exists(os.path.join(doc_dir, s_name + '.pdf'))
        if tiene_doc:
            con_ficha += 1
        else:
            pendientes_ficha.append(no_parte)
            
    print(f"\nEstado actual del catálogo ({total} productos):")
    print(f"  - Con fotografía:      {con_foto} / {total} (Faltan {len(pendientes_foto)})")
    print(f"  - Con ficha técnica:   {con_ficha} / {total} (Faltan {len(pendientes_ficha)})")
    
    if dry_run:
        print("\n[MODO SIMULADOR ACTIVADO (--dry-run)]")
        print(f"Endpoint configurado: {endpoint}")
        if not api_key or 'tu_token' in api_key:
            print("AVISO: No se ha configurado un API Key real en 'config.env'.")
        else:
            print("API Key detectada.")
        print("Fin de la simulación. Ningún archivo fue descargado.")
        return
        
    # Verificar credenciales para sincronización real
    if not api_key or 'tu_token' in api_key or endpoint == 'http://localhost:8000/v1':
        print("\n" + "!" * 60)
        print("AVISO PARA EL ADMINISTRADOR:")
        print("Para descargar automáticamente las fotos y fichas faltantes desde Syscom,")
        print("ingresa tu endpoint y API Key en el archivo 'config.env'.")
        print("!" * 60)
        return
        
    print(f"\nIniciando conexión con el MCP de Syscom en {endpoint}...")
    descargadas_fotos = 0
    descargadas_fichas = 0
    
    for i, no_parte in enumerate(df['No. de Parte'].unique(), 1):
        if not no_parte: continue
        s_name = safe_filename(no_parte)
        
        # Consultar MCP
        print(f"[{i}/{total}] Consultando {no_parte}...", end=' ')
        res = consultar_mcp_syscom(no_parte, endpoint, api_key)
        
        if res:
            # Descargar imagen si no existe
            if config['DOWNLOAD_IMAGES'] and res.get('imagen_url'):
                img_dest = os.path.join(img_dir, f"{s_name}.jpg")
                if not any(os.path.exists(os.path.join(img_dir, s_name + ext)) for ext in ['.png', '.jpg', '.jpeg', '.avif', '.webp']):
                    if descargar_archivo(res['imagen_url'], img_dest):
                        descargadas_fotos += 1
                        print("Foto OK", end=' | ')
                        
            # Descargar ficha si no existe
            if config['DOWNLOAD_DATASHEETS'] and res.get('ficha_url'):
                doc_dest = os.path.join(doc_dir, f"{s_name}.pdf")
                if not os.path.exists(doc_dest):
                    if descargar_archivo(res['ficha_url'], doc_dest):
                        descargadas_fichas += 1
                        print("Ficha OK", end=' ')
            print("")
        else:
            print("No encontrado o sin datos.")
            
    print("\n" + "=" * 60)
    print(f"Sincronización finalizada:")
    print(f"  - Nuevas fotos descargadas:  {descargadas_fotos}")
    print(f"  - Nuevas fichas descargadas: {descargadas_fichas}")
    print("=" * 60)
    
    # Actualizar base de datos web automáticamente
    print("\nActualizando base de datos web (datos.js)...")
    try:
        import actualizar_web
        actualizar_web.actualizar()
    except Exception as e:
        print(f"Error ejecutando actualizar_web: {e}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Sincronizador de recursos con MCP de Syscom")
    parser.add_argument('--dry-run', action='store_true', help="Ejecuta en modo simulación sin descargar archivos")
    args = parser.parse_args()
    
    sincronizar_catalogo(dry_run=args.dry_run)
