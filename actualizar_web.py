import os
import re
import json
import hashlib
import logging
import html
import urllib.parse
from datetime import datetime
import pandas as pd

# Configurar logging
log_file = 'actualizar_web.log'
logging.basicConfig(
    filename=log_file,
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    encoding='utf-8'
)

def safe_filename(name):
    """Reemplaza caracteres no válidos para el sistema de archivos."""
    return str(name).replace('/', '-').replace('\\', '-').strip()

def slugify(text):
    """Genera un slug limpio y amigable para URLs SEO (sin paréntesis ni caracteres especiales)."""
    clean = re.sub(r'[^a-zA-Z0-9\-]+', '-', str(text).lower()).strip('-')
    return clean or 'producto'

def normalizar_marca(marca_raw):
    """Normaliza variantes de marcas a su nombre canónico oficial de BITMOVIL."""
    m = str(marca_raw or '').strip()
    upper = m.upper()
    if upper.startswith('EPCOM') or 'BY EPCOM' in upper:
        return 'EPCOM'
    if upper.startswith('HONEYWELL'):
        return 'HONEYWELL'
    if upper.startswith('HILOOK') or upper == 'HILOOK':
        return 'HILOOK'
    if upper.startswith('LINKEDPRO'):
        return 'LINKEDPRO'
    if 'WESTERN DIGITAL' in upper or upper == 'WD':
        return 'WESTERN DIGITAL'
    return m

def calcular_hash_archivo(ruta):
    """Calcula el hash MD5 truncado de 8 caracteres para versionado de caché."""
    if not os.path.exists(ruta):
        return 'v1'
    with open(ruta, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()[:8]

def generar_pagina_estatica(prod, dir_p, base_url="https://catalogo.bitmovil.mx"):
    """Genera una página estática HTML en web/p/ con metadatos OpenGraph y Schema.org."""
    slug = slugify(prod['no_parte'])
    ruta_html = os.path.join(dir_p, f"{slug}.html")
    canonical_url = f"{base_url}/p/{slug}.html"
    
    # Regla Anti-Thin Content: Si no tiene imagen ni ficha, se marca con noindex
    tiene_contenido = prod['tiene_imagen'] or prod['tiene_ficha']
    robots_meta = "index, follow" if tiene_contenido else "noindex, follow"

    safe_title = html.escape(f"{prod['no_parte']} {prod['marca_normalizada']} | Catálogo BITMOVIL")
    safe_desc = html.escape(prod['descripcion'])
    safe_marca = html.escape(prod['marca_normalizada'])
    safe_modelo = html.escape(prod['no_parte'])
    
    img_tag = ""
    if prod['tiene_imagen']:
        img_url = f"{base_url}/{prod['imagen_url']}"
        img_tag = f'<img src="../{html.escape(prod["imagen_url"])}" alt="{safe_modelo}" style="max-height:260px;object-fit:contain;margin:0 auto;display:block;">'
    else:
        img_url = f"{base_url}/img/logo-bitmovil.webp"
        img_tag = '<div style="height:120px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.9rem;">📷 Fotografía en proceso de actualización</div>'

    wa_text = urllib.parse.quote(f"Hola BITMOVIL, solicito cotización para el modelo {prod['no_parte']} ({prod['marca_normalizada']}).")
    wa_url = f"https://wa.me/528332272527?text={wa_text}"

    ficha_html = ""
    if prod['tiene_ficha']:
        ficha_html = f'<a href="../{html.escape(prod["ficha_url"])}" class="btn-ficha" target="_blank" download style="display:inline-block;padding:0.6rem 1rem;background:#1e3a8a;color:white;text-decoration:none;border-radius:6px;font-weight:600;">📄 Descargar Ficha Técnica Oficial</a>'

    plantilla = f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{safe_title}</title>
    <meta name="description" content="{safe_desc}">
    <meta name="robots" content="{robots_meta}">
    <link rel="canonical" href="{canonical_url}">
    
    <!-- OpenGraph & Twitter -->
    <meta property="og:title" content="{safe_title}">
    <meta property="og:description" content="{safe_desc}">
    <meta property="og:image" content="{img_url}">
    <meta property="og:url" content="{canonical_url}">
    <meta property="og:type" content="product">
    
    <!-- Schema.org Product -->
    <script type="application/ld+json">
    {{
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": "{safe_modelo}",
      "image": "{img_url}",
      "description": "{safe_desc}",
      "brand": {{
        "@type": "Brand",
        "name": "{safe_marca}"
      }}
    }}
    </script>
    
    <link rel="stylesheet" href="../css/styles.css">
</head>
<body style="background:#f8fafc;display:flex;flex-direction:column;min-height:100vh;">
    <header style="background:#0f172a;padding:0.75rem 1.5rem;display:flex;align-items:center;justify-content:space-between;">
        <a href="../index.html">
            <img src="../img/logo-bitmovil.webp" alt="BITMOVIL Logo" style="height:36px;">
        </a>
        <a href="../index.html" style="color:#93c5fd;text-decoration:none;font-size:0.9rem;">← Volver al Catálogo Completo</a>
    </header>

    <main style="max-width:800px;margin:2rem auto;padding:1.5rem;background:white;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 4px 6px rgba(0,0,0,0.05);flex:1;">
        <span class="brand-badge" style="background:#eff6ff;color:#1e3a8a;font-weight:700;padding:0.25rem 0.6rem;border-radius:4px;font-size:0.8rem;">{safe_marca}</span>
        <h1 style="color:#1e3a8a;margin:0.5rem 0;font-size:1.8rem;">{safe_modelo}</h1>
        <div style="color:#64748b;font-size:0.9rem;margin-bottom:1.5rem;">{html.escape(prod.get('linea', 'Infraestructura TI'))}</div>
        
        <div style="background:#ffffff;border:1px solid #f1f5f9;border-radius:8px;padding:1.5rem;margin-bottom:1.5rem;">
            {img_tag}
        </div>

        <h3 style="color:#0f172a;margin-bottom:0.5rem;">Especificaciones del Producto:</h3>
        <p style="font-size:1rem;line-height:1.6;color:#334155;margin-bottom:2rem;">{safe_desc}</p>

        <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center;margin-bottom:2rem;">
            <a href="{wa_url}" target="_blank" style="display:inline-block;padding:0.75rem 1.25rem;background:#25d366;color:white;text-decoration:none;border-radius:6px;font-weight:700;font-size:0.95rem;">
                💬 Cotizar este Modelo por WhatsApp
            </a>
            {ficha_html}
        </div>

        <!-- Cobertura y Servicios BITMOVIL -->
        <div style="background:#f8fafc;border-left:4px solid #1e3a8a;padding:1rem;border-radius:4px;font-size:0.85rem;color:#475569;line-height:1.5;">
            <strong>Integración y Soporte BITMOVIL:</strong> Suministro, instalación certificada y soporte corporativo en Tampico, Monterrey, Saltillo y toda la Zona Golfo de México.
        </div>
    </main>

    <footer style="text-align:center;padding:1.5rem;color:#64748b;font-size:0.8rem;border-top:1px solid #e2e8f0;background:white;">
        © 2026 BITMOVIL. Todos los derechos reservados. | <a href="https://bitmovil.mx/aviso-de-privacidad" target="_blank" style="color:#1e3a8a;">Aviso de Privacidad</a>
    </footer>
</body>
</html>"""
    
    with open(ruta_html, 'w', encoding='utf-8') as f:
        f.write(plantilla)

    return canonical_url if tiene_contenido else None

def actualizar():
    logging.info("==================================================")
    logging.info("Iniciando actualización completa del catálogo web...")
    
    excel_path = 'Portafolio_Articulos_por_Linea.xlsx'
    json_path = 'web/datos.json'
    js_path = 'web/datos.js'
    csv_path = 'web/catalogo.csv'
    img_dir = 'web/imagenes'
    doc_dir = 'web/fichas_tecnicas'
    p_dir = 'web/p'
    sitemap_path = 'web/sitemap.xml'
    robots_path = 'web/robots.txt'
    index_html_path = 'web/index.html'

    os.makedirs(img_dir, exist_ok=True)
    os.makedirs(doc_dir, exist_ok=True)
    os.makedirs(p_dir, exist_ok=True)
    
    logging.info(f"Leyendo Excel desde: {excel_path}")
    try:
        df = pd.read_excel(excel_path, sheet_name='Lista (filtrable)')
        df = df.fillna('')
    except Exception as e:
        logging.error(f"Error al leer el archivo Excel: {e}")
        print(f"Error al leer el archivo Excel: {e}")
        return

    # 1. Validación de integridad del Excel
    modelos = [str(m).strip() for m in df['No. de Parte'] if str(m).strip()]
    duplicados = [m for m in set(modelos) if modelos.count(m) > 1]
    if duplicados:
        logging.warning(f"Modelos duplicados detectados en el Excel ({len(duplicados)}): {duplicados}")
        print(f"AVISO: Se detectaron {len(duplicados)} modelos duplicados en el Excel.")

    # 2. Procesamiento del catálogo
    catalogo = []
    lista_plana = []
    lineas = df['Línea de Producto'].unique()
    
    total_productos = 0
    total_imagenes = 0
    total_fichas = 0
    urls_sitemap = []
    
    for linea in lineas:
        if not linea: continue
        
        productos_linea = []
        df_linea = df[df['Línea de Producto'] == linea]
        
        for _, row in df_linea.iterrows():
            no_parte = str(row.get('No. de Parte', '')).strip()
            if not no_parte: continue

            marca_raw = str(row.get('Marca', '')).strip()
            marca_norm = normalizar_marca(marca_raw)
            descripcion = str(row.get('Descripción', '')).strip()
            
            s_name = safe_filename(no_parte)
            
            # Revisar imagen
            tiene_img = False
            img_ext = ""
            for ext in ['.png', '.jpg', '.jpeg', '.avif', '.webp']:
                if os.path.exists(os.path.join(img_dir, s_name + ext)):
                    tiene_img = True
                    img_ext = ext
                    break
                    
            # Revisar ficha técnica
            tiene_ficha = os.path.exists(os.path.join(doc_dir, s_name + '.pdf'))
            
            if tiene_img: total_imagenes += 1
            if tiene_ficha: total_fichas += 1
            total_productos += 1
            
            prod_dict = {
                "no_parte": no_parte,
                "safe_no_parte": s_name,
                "marca": marca_raw,
                "marca_normalizada": marca_norm,
                "descripcion": descripcion,
                "linea": linea,
                "tiene_imagen": tiene_img,
                "imagen_url": f"imagenes/{s_name}{img_ext}" if tiene_img else None,
                "tiene_ficha": tiene_ficha,
                "ficha_url": f"fichas_tecnicas/{s_name}.pdf" if tiene_ficha else None
            }
            
            productos_linea.append(prod_dict)
            lista_plana.append(prod_dict)

            # Generar página estática para SEO
            url_canonica = generar_pagina_estatica(prod_dict, p_dir)
            if url_canonica:
                urls_sitemap.append(url_canonica)
            
        catalogo.append({
            "linea": linea,
            "productos": productos_linea
        })

    # 3. Guardar datos.json y datos.js
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(catalogo, f, ensure_ascii=False, indent=2)
        
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("const catalogoData = ")
        json.dump(catalogo, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    # 4. Exportar CSV para control de versiones en Git
    df_export = pd.DataFrame([{
        'Linea': p['linea'],
        'No_Parte': p['no_parte'],
        'Marca': p['marca_normalizada'],
        'Descripcion': p['descripcion'],
        'Tiene_Imagen': 'SI' if p['tiene_imagen'] else 'NO',
        'Tiene_Ficha': 'SI' if p['tiene_ficha'] else 'NO'
    } for p in lista_plana])
    df_export.to_csv(csv_path, index=False, encoding='utf-8-sig')

    # 5. Generar sitemap.xml canónico (Solo URLs con contenido)
    today = datetime.now().strftime('%Y-%m-%d')
    sitemap_xml = ['<?xml version="1.0" encoding="UTF-8"?>']
    sitemap_xml.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    sitemap_xml.append('  <url>')
    sitemap_xml.append('    <loc>https://catalogo.bitmovil.mx/</loc>')
    sitemap_xml.append(f'    <lastmod>{today}</lastmod>')
    sitemap_xml.append('    <priority>1.0</priority>')
    sitemap_xml.append('  </url>')

    for u in urls_sitemap:
        sitemap_xml.append('  <url>')
        sitemap_xml.append(f'    <loc>{u}</loc>')
        sitemap_xml.append(f'    <lastmod>{today}</lastmod>')
        sitemap_xml.append('    <priority>0.8</priority>')
        sitemap_xml.append('  </url>')
    sitemap_xml.append('</urlset>')

    with open(sitemap_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(sitemap_xml))

    # 6. Generar robots.txt
    robots_txt = "User-agent: *\nAllow: /\n\nSitemap: https://catalogo.bitmovil.mx/sitemap.xml\n"
    with open(robots_path, 'w', encoding='utf-8') as f:
        f.write(robots_txt)

    # 7. Inyección idempotente de Cache-Busting en web/index.html (?v=hash)
    if os.path.exists(index_html_path):
        with open(index_html_path, 'r', encoding='utf-8') as f:
            html_content = f.read()

        assets = {
            'css/styles.css': 'web/css/styles.css',
            'datos.js': 'web/datos.js',
            'js/cart.js': 'web/js/cart.js',
            'js/chat.js': 'web/js/chat.js',
            'js/app.js': 'web/js/app.js'
        }

        for asset_url, file_path in assets.items():
            h = calcular_hash_archivo(file_path)
            # Reemplazar de forma idempotente con regex (\?v=[a-f0-9]+)?
            pattern = re.compile(rf'({re.escape(asset_url)})(\?v=[a-f0-9]+)?')
            html_content = pattern.sub(rf'\1?v={h}', html_content)

        # Actualizar logo a versión local
        html_content = html_content.replace(
            'https://bitmovil.mx/img/logos/logo-bitmovil-blanco.webp',
            'img/logo-bitmovil.webp'
        )

        with open(index_html_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

    print(f"\n=======================================================")
    print(f"CATÁLOGO WEB ACTUALIZADO CON ÉXITO")
    print(f"=======================================================")
    print(f"Total productos procesados: {total_productos}")
    print(f"Fotografías vinculadas:    {total_imagenes}")
    print(f"Fichas técnicas en PDF:    {total_fichas}")
    print(f"Páginas estáticas SEO:     {len(lista_plana)} (Indexadas en sitemap: {len(urls_sitemap)})")
    print(f"Archivos exportados:       datos.js, datos.json, catalogo.csv, sitemap.xml, robots.txt")
    print(f"Cache-busting inyectado:   Idempotente con hash MD5 en index.html")
    print(f"=======================================================\n")

if __name__ == '__main__':
    actualizar()
