// UI translations for the app chrome. Keys are the English strings, so a missing translation
// falls back to English. Long documents (build list, guides) stay English.
export const LANGS: Record<string, string> = { en: 'English', es: 'Español', pt: 'Português (BR)' };
const D: Record<string, Record<string, string>> = {
  es: {
    'Current farm': 'Granja actual', 'Optimized ★': 'Optimizada ★', 'Use what I own': 'Con lo que tengo', 'Ginger Island': 'Isla Jengibre',
    Greenhouse: 'Invernadero', 'House & chests': 'Casa y cofres', 'Build list': 'Lista de obra', 'Move plan': 'Plan de mudanza',
    'Crops & profit': 'Cultivos y ganancia', Interiors: 'Interiores',
    Edit: 'Editar', Crops: 'Cultivos', Sprinklers: 'Aspersores', Scarecrows: 'Espantapájaros', 'Fences & paths': 'Vallas y caminos',
    Trees: 'Árboles', Objects: 'Objetos', Buildings: 'Edificios', 'Select / move': 'Seleccionar / mover', Eraser: 'Borrador',
    'Fill area': 'Rellenar área', 'Rectangle mode': 'Modo rectángulo', Crop: 'Cultivo', 'Iridium (5×5)': 'Iridio (5×5)',
    'Quality (3×3)': 'Calidad (3×3)', 'Basic (4 tiles)': 'Básico (4 casillas)', 'Deluxe (r 16)': 'De lujo (r 16)', 'Scarecrow (r 8)': 'Espantapájaros (r 8)',
    Fence: 'Valla', Gate: 'Puerta', 'Path / flooring': 'Camino / suelo', Tree: 'Árbol', 'Tapper tree': 'Árbol con grifo', 'Fruit tree': 'Frutal',
    'Bee house': 'Colmena', Machine: 'Máquina', Chest: 'Cofre', 'Lightning rod': 'Pararrayos',
    Inspector: 'Inspector', Overlays: 'Capas', Optimizer: 'Optimizador', Legend: 'Leyenda', Water: 'Agua', Junimo: 'Junimo', Crows: 'Cuervos',
    Problems: 'Problemas', Grid: 'Cuadrícula', Labels: 'Etiquetas', Diff: 'Cambios', 'Load save': 'Cargar partida', Close: 'Cerrar', Fit: 'Ajustar',
    'Hover a tile': 'Pasa el cursor por una casilla', iridium: 'iridio', quality: 'calidad', basic: 'básico', Huts: 'Cabañas', deluxe: 'de lujo',
    regular: 'normales', problems: 'problemas', 'Watered': 'Regada', 'Junimo range': 'Alcance Junimo', 'Scarecrow': 'Espantapájaros',
    Tile: 'Casilla', Terrain: 'Terreno', Building: 'Edificio', 'On tile': 'En la casilla', yes: 'sí', no: 'no',
    'Space+drag or middle-drag to pan · wheel to zoom · Shift+drag = rectangle': 'Espacio+arrastrar para mover · rueda para zoom · Mayús+arrastrar = rectángulo',
    'Export plan (JSON)': 'Exportar plan (JSON)', 'Import plan (JSON)': 'Importar plan (JSON)', 'Export PNG of view': 'Exportar PNG de la vista',
    'Reset this tab': 'Restablecer pestaña', 'Copy share link': 'Copiar enlace para compartir', 'Game graphics…': 'Gráficos del juego…',
    'Import custom map (.tmx)': 'Importar mapa (.tmx)', 'About & privacy': 'Acerca de y privacidad', Language: 'Idioma',
    'Junimo huts': 'Cabañas Junimo', 'Deluxe scarecrows': 'Espantapájaros de lujo', 'Fence ring': 'Anillo de vallas',
    'Floor every open tile (weed-proof)': 'Pavimentar todo (sin malas hierbas)', 'Tapper trees': 'Árboles con grifo', 'Bee houses': 'Colmenas',
    'Fix coverage gaps': 'Corregir huecos', 'Re-optimize this farm': 'Reoptimizar esta granja', 'Best possible → Optimized tab': 'Lo mejor posible → Optimizada',
    'With what I own → its tab': 'Con lo que tengo → su pestaña', 'Re-lay sprinklers': 'Recolocar aspersores', 'Re-optimize with what I own': 'Reoptimizar con lo que tengo',
    'Keep buildings where they are': 'Dejar los edificios donde están', Share: 'Compartir',
  },
  pt: {
    'Current farm': 'Fazenda atual', 'Optimized ★': 'Otimizada ★', 'Use what I own': 'Com o que tenho', 'Ginger Island': 'Ilha Gengibre',
    Greenhouse: 'Estufa', 'House & chests': 'Casa e baús', 'Build list': 'Lista de obra', 'Move plan': 'Plano de mudança',
    'Crops & profit': 'Plantio e lucro', Interiors: 'Interiores',
    Edit: 'Editar', Crops: 'Plantações', Sprinklers: 'Regadores', Scarecrows: 'Espantalhos', 'Fences & paths': 'Cercas e caminhos',
    Trees: 'Árvores', Objects: 'Objetos', Buildings: 'Construções', 'Select / move': 'Selecionar / mover', Eraser: 'Borracha',
    'Fill area': 'Preencher área', 'Rectangle mode': 'Modo retângulo', Crop: 'Plantação', 'Iridium (5×5)': 'Irídio (5×5)',
    'Quality (3×3)': 'Qualidade (3×3)', 'Basic (4 tiles)': 'Básico (4 blocos)', 'Deluxe (r 16)': 'Deluxe (r 16)', 'Scarecrow (r 8)': 'Espantalho (r 8)',
    Fence: 'Cerca', Gate: 'Portão', 'Path / flooring': 'Caminho / piso', Tree: 'Árvore', 'Tapper tree': 'Árvore com torneira', 'Fruit tree': 'Árvore frutífera',
    'Bee house': 'Colmeia', Machine: 'Máquina', Chest: 'Baú', 'Lightning rod': 'Para-raios',
    Inspector: 'Inspetor', Overlays: 'Camadas', Optimizer: 'Otimizador', Legend: 'Legenda', Water: 'Água', Junimo: 'Junimo', Crows: 'Corvos',
    Problems: 'Problemas', Grid: 'Grade', Labels: 'Rótulos', Diff: 'Mudanças', 'Load save': 'Carregar save', Close: 'Fechar', Fit: 'Ajustar',
    'Hover a tile': 'Passe o mouse em um bloco', iridium: 'irídio', quality: 'qualidade', basic: 'básico', Huts: 'Cabanas', deluxe: 'deluxe',
    regular: 'comuns', problems: 'problemas', 'Watered': 'Regado', 'Junimo range': 'Alcance Junimo', 'Scarecrow': 'Espantalho',
    Tile: 'Bloco', Terrain: 'Terreno', Building: 'Construção', 'On tile': 'No bloco', yes: 'sim', no: 'não',
    'Space+drag or middle-drag to pan · wheel to zoom · Shift+drag = rectangle': 'Espaço+arrastar para mover · roda para zoom · Shift+arrastar = retângulo',
    'Export plan (JSON)': 'Exportar plano (JSON)', 'Import plan (JSON)': 'Importar plano (JSON)', 'Export PNG of view': 'Exportar PNG da vista',
    'Reset this tab': 'Restaurar aba', 'Copy share link': 'Copiar link de compartilhamento', 'Game graphics…': 'Gráficos do jogo…',
    'Import custom map (.tmx)': 'Importar mapa (.tmx)', 'About & privacy': 'Sobre e privacidade', Language: 'Idioma',
    'Junimo huts': 'Cabanas Junimo', 'Deluxe scarecrows': 'Espantalhos deluxe', 'Fence ring': 'Anel de cercas',
    'Floor every open tile (weed-proof)': 'Pavimentar tudo (sem ervas daninhas)', 'Tapper trees': 'Árvores com torneira', 'Bee houses': 'Colmeias',
    'Fix coverage gaps': 'Corrigir falhas', 'Re-optimize this farm': 'Reotimizar esta fazenda', 'Best possible → Optimized tab': 'Melhor possível → Otimizada',
    'With what I own → its tab': 'Com o que tenho → sua aba', 'Re-lay sprinklers': 'Reposicionar regadores', 'Re-optimize with what I own': 'Reotimizar com o que tenho',
    'Keep buildings where they are': 'Manter construções no lugar', Share: 'Compartilhar',
  },
};
let lang = 'en';
export const setLang = (l: string) => { lang = LANGS[l] ? l : 'en'; document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang; };
export const getLang = () => lang;
export const t = (s: string) => D[lang]?.[s] ?? s;
export const detectLang = () => { const n = (navigator.language || 'en').slice(0, 2); return LANGS[n] ? n : 'en'; };
