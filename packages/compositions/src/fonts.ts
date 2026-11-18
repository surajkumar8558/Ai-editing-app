import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

// Font files ship in public/fonts (OFL licence), so renders never depend on a font CDN.
export const DISPLAY_FONT = 'Anton';
loadFont({ family: DISPLAY_FONT, url: staticFile('fonts/Anton-Regular.woff2') });
