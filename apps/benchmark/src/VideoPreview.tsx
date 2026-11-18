import { Canvas, Group, Image, matchFont, Text, useVideo } from '@shopify/react-native-skia';
import { useState } from 'react';
import { Platform, Pressable, Text as RNText, useWindowDimensions, View } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import type { MaskTrack } from './videoMasks';

interface Props {
  videoUri: string;
  track: MaskTrack;
  text: string;
}

/**
 * Plays the whole video with the text-behind-person effect:
 *   video frame → text → (mask ∩ video frame) on top.
 * The mask for each frame is the precomputed one nearest in time.
 */
export function VideoPreview({ videoUri, track, text }: Props) {
  // useVideo only reacts to shared values; a plain boolean would be read once.
  const pausedSV = useSharedValue(false);
  const [paused, setPaused] = useState(false);
  const togglePause = () => {
    pausedSV.value = !paused;
    setPaused(!paused);
  };
  const { currentFrame, currentTime, size, rotation } = useVideo(videoUri, {
    looping: true,
    paused: pausedSV,
    volume: 1,
  });
  const { width: screenW } = useWindowDimensions();

  // Video frames come unrotated; portrait phone videos usually carry rotation = 90.
  const sideways = rotation === 90 || rotation === 270;
  const uprightW = sideways ? size.height : size.width;
  const uprightH = sideways ? size.width : size.height;
  const aspect = uprightW > 0 && uprightH > 0 ? uprightW / uprightH : 9 / 16;
  const W = Math.min(screenW - 32, 420 * aspect);
  const H = W / aspect;
  // Size to draw the raw frame at, before rotating it into the upright W x H box.
  const dw = sideways ? H : W;
  const dh = sideways ? W : H;
  const frameTransform = [
    { translateX: W / 2 },
    { translateY: H / 2 },
    { rotate: (rotation * Math.PI) / 180 },
    { translateX: -dw / 2 },
    { translateY: -dh / 2 },
  ];

  const { masks, fps } = track;
  const mask = useDerivedValue(() => {
    const i = Math.round((currentTime.value / 1000) * fps);
    return masks[Math.min(masks.length - 1, Math.max(0, i))];
  });

  const font = matchFont({
    fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
    fontSize: H * 0.2,
    fontWeight: 'bold',
  });
  const textW = font.measureText(text).width;

  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={togglePause}>
        <Canvas style={{ width: W, height: H, alignSelf: 'center' }}>
          <Group transform={frameTransform}>
            <Image image={currentFrame} x={0} y={0} width={dw} height={dh} fit="fill" />
          </Group>
          <Text text={text} font={font} x={(W - textW) / 2} y={H * 0.4} color="#FFD400" />
          {/* Layer: mask first, then keep the video only where the mask is opaque. */}
          <Group layer>
            <Image image={mask} x={0} y={0} width={W} height={H} fit="fill" />
            <Group transform={frameTransform}>
              <Image image={currentFrame} x={0} y={0} width={dw} height={dh} fit="fill" blendMode="srcIn" />
            </Group>
          </Group>
        </Canvas>
      </Pressable>
      <RNText style={{ color: '#666', fontSize: 12, textAlign: 'center' }}>
        Tap the video to {paused ? 'play' : 'pause'} · {masks.length} masks at {fps} fps
      </RNText>
    </View>
  );
}
