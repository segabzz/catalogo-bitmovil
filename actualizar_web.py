import os
import json
import logging
import pandas as pd
from datetime import datetime

# Configurar logging
log_file = 'actualizar_web.log'
logging.basicConfig(
    filename=log_file,
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    encoding='utf-8'
)

def safe_filename(name):
    # Replace slashes with dashes to avoid filesystem issues
    return str(name).replace('/', '-')

def actualizar():
    logging.info("==================================================")
    logging.info("Iniciando actualización del catálogo web...")
    
    excel_path = 'Portafolio_Articulos_por_Linea.xlsx'
    json_path = 'web/datos.json'
    js_path = 'web/datos.js'
    img_dir = 'web/imagenes'
    doc_dir = 'web/fichas_tecnicas'
    
    logging.info(f"Leyendo Excel desde: {excel_path}")
    try:
        df = pd.read_excel(excel_path, sheet_name='Lista (filtrable)')
        df = df.fillna('')
    except Exception as e:
        logging.error(f"Error al leer el archivo Excel: {e}")
        print(f"Error al leer el archivo Excel: {e}")
        return
    
    catalogo = []
    lineas = df['Línea de Producto'].unique()
    logging.info(f"Se encontraron {len(lineas)} líneas de producto.")
    
    total_productos = 0
    total_imagenes = 0
    total_fichas = 0
    
    for linea in lineas:
        if not linea: continue
        
        productos_linea = []
        df_linea = df[df['Línea de Producto'] == linea]
        logging.info(f"Procesando línea: {linea} ({len(df_linea)} productos)")
        
        for _, row in df_linea.iterrows():
            no_parte = str(row.get('No. de Parte', '')).strip()
            marca = str(row.get('Marca', '')).strip()
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
            
            productos_linea.append({
                "no_parte": no_parte,
                "safe_no_parte": s_name,
                "marca": marca,
                "descripcion": descripcion,
                "tiene_imagen": tiene_img,
                "imagen_url": f"imagenes/{s_name}{img_ext}" if tiene_img else None,
                "tiene_ficha": tiene_ficha,
                "ficha_url": f"fichas_tecnicas/{s_name}.pdf" if tiene_ficha else None
            })
            
        catalogo.append({
            "linea": linea,
            "productos": productos_linea
        })
        
    logging.info(f"Resumen: {total_productos} productos totales, {total_imagenes} con imagen, {total_fichas} con ficha técnica.")
    
    try:
        # Guardar JSON normal (backup/referencia)
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(catalogo, f, ensure_ascii=False, indent=2)
        logging.info(f"Archivo guardado: {json_path}")
        
        # Guardar como JS para evitar error CORS en navegadores locales
        with open(js_path, 'w', encoding='utf-8') as f:
            f.write("const catalogoData = ")
            json.dump(catalogo, f, ensure_ascii=False, indent=2)
            f.write(";\n")
        logging.info(f"Archivo guardado: {js_path} (Solución a CORS aplicada)")
        
        print(f"Catálogo web actualizado correctamente.")
        print(f"Se encontraron {total_imagenes} imágenes y {total_fichas} fichas técnicas.")
        print("Revisa 'actualizar_web.log' para más detalles.")
        logging.info("Actualización completada exitosamente.")
    except Exception as e:
        logging.error(f"Error al escribir los archivos de salida: {e}")
        print(f"Error al escribir los archivos de salida: {e}")

if __name__ == '__main__':
    actualizar()
