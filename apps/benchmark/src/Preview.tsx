import { Canvas, Group, Image, matchFont, Text, type SkImage } from '@shopify/react-native-skia';
import { Platform, useWindowDimensions } from 'react-native';

interface Props {
  frame: SkImage;
  mask: SkImage;
  text: string;
}

/**
 * The "text behind person" composite:
 *   1. original frame (background)
 *   2. big text
 *   3. the person cut out with the mask, drawn on top so it covers the text
 */
export function Preview({ frame, mask, text }: Props) {
  const { width: screenW } = useWindowDimensions();
  const maxW = screenW - 32;
  const aspect = frame.width() / frame.height();
  const w = Math.min(maxW, 360 * aspect);
  const h = w / aspect;

  const fontSize = h * 0.22;
  const font = matchFont({
    fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
    fontSize,
    fontWeight: 'bold',
  });
  const textW = font.measureText(text).width;

  return (
    <Canvas style={{ width: w, height: h, alignSelf: 'center', borderRadius: 12 }}>
      <Image image={frame} x={0} y={0} width={w} height={h} fit="fill" />
      <Text text={text} font={font} x={(w - textW) / 2} y={h * 0.42} color="#FFD400" />
      {/* Layer: draw the mask, then keep frame pixels only where the mask is opaque. */}
      <Group layer>
        <Image image={mask} x={0} y={0} width={w} height={h} fit="fill" />
        <Image image={frame} x={0} y={0} width={w} height={h} fit="fill" blendMode="srcIn" />
      </Group>
    </Canvas>
  );
}
