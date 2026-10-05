/**
 * Pruebas unitarias del motor de búsqueda (Node.js)
 * Importa directamente la misma fuente de verdad: web/js/app.js
 */

const assert = require('assert');
const { normalizeText, scoreProduct, searchCatalog } = require('../web/js/app.js');

console.log('--- INICIANDO PRUEBAS UNITARIAS DEL MOTOR DE BÚSQUEDA ---');

// 1. Prueba de Normalización y Diacríticos
console.log('1. Verificando normalización de texto y acentos...');
assert.strictEqual(normalizeText('CÁMARAS'), 'camaras');
assert.strictEqual(normalizeText('Categoría 6A'), 'categoria 6a');
assert.strictEqual(normalizeText('  HIKVISION  '), 'hikvision');
console.log('   ✓ Normalización correcta.');

// 2. Mock de Catálogo representativo de Bitmovil
const mockCatalog = [
    {
        linea: 'Videovigilancia',
        productos: [
            {
                no_parte: 'DS-2CD1043G2-LIU(F)',
                marca: 'HIKVISION',
                marca_normalizada: 'HIKVISION',
                descripcion: 'Bala IP 4 MP Dual Light, IR 30 m + luz blanca'
            },
            {
                no_parte: 'DS-2CE76K0T-LMFS',
                marca: 'HIKVISION',
                marca_normalizada: 'HIKVISION',
                descripcion: 'Turret TurboHD 3K (5 MP) ColorVu'
            }
        ]
    },
    {
        linea: 'Redes e IT',
        productos: [
            {
                no_parte: 'USW-LITE-8-POE',
                marca: 'UBIQUITI',
                marca_normalizada: 'UBIQUITI',
                descripcion: 'Switch gestionable de 8 puertos Gigabit con 4 puertos PoE+'
            },
            {
                no_parte: 'LBE-M5-23',
                marca: 'UBIQUITI',
                marca_normalizada: 'UBIQUITI',
                descripcion: 'Antena LiteBeam M5 CPE inalámbrico para enlaces punto a punto'
            }
        ]
    }
];

// 3. Prueba de Sinónimos (Búsqueda "camaras" encuentra "Bala" y "Turret")
console.log('2. Verificando diccionario de sinónimos (camaras -> bala / turret)...');
const resCamaras = searchCatalog(mockCatalog, 'camaras');
assert.ok(resCamaras.length >= 2, 'Debe encontrar al menos 2 cámaras usando sinónimos');
assert.ok(resCamaras[0].product.no_parte.startsWith('DS-2C'));
console.log('   ✓ Sinónimos funcionando correctamente.');

// 4. Prueba de Relevancia (Búsqueda "switch" debe poner USW-LITE-8-POE antes que LiteBeam)
console.log('3. Verificando relevancia de scoring (Switch PoE vs Antena)...');
const resSwitch = searchCatalog(mockCatalog, 'switch');
assert.ok(resSwitch.length >= 1, 'Debe encontrar al menos 1 switch');
assert.strictEqual(resSwitch[0].product.no_parte, 'USW-LITE-8-POE', 'El switch debe tener la puntuación más alta');
console.log('   ✓ Relevancia y ponderación de pesos correcta.');

// 5. Prueba de Coincidencia Exacta de Modelo
console.log('4. Verificando coincidencia exacta de número de parte...');
const scoreExact = scoreProduct(mockCatalog[0].productos[0], 'DS-2CD1043G2-LIU(F)');
assert.ok(scoreExact >= 150, 'El modelo exacto debe recibir puntaje máximo');
console.log('   ✓ Búsqueda por modelo exacto correcta.');

// 6. Prueba de Exclusión (Tokens no coincidentes retornan score 0)
console.log('5. Verificando descarte cuando un token no coincide...');
const scoreNoMatch = scoreProduct(mockCatalog[0].productos[0], 'camara refrigerador');
assert.strictEqual(scoreNoMatch, 0, 'Si un token no coincide, el score total debe ser 0');
console.log('   ✓ Filtro estricto multi-token correcto.');

console.log('\n========================================');
console.log('¡TODAS LAS PRUEBAS DE BÚSQUEDA PASARON AL 100%!');
console.log('========================================');
