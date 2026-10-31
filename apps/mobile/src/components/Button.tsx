// apps/mobile/src/components/Button.tsx
import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { COLORS, RADIUS, SPACING, TOUCH_TARGET } from '@/design/tokens';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
type Size = 'small' | 'medium' | 'large';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  textStyle,
}: ButtonProps) {
  const containerStyle = [
    styles.base,
    styles[variant],
    styles[`size_${size}`],
    (disabled || loading) && styles.disabled,
    style,
  ];

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? '#000' : COLORS.text}
        />
      ) : (
        <Text style={[styles.text, styles[`text_${variant}`], styles[`textSize_${size}`], textStyle]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
    paddingHorizontal: SPACING.lg,
  },
  primary: { backgroundColor: COLORS.accent },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: COLORS.danger },
  disabled: { opacity: 0.4 },

  size_small: { paddingVertical: SPACING.sm, minHeight: 36 },
  size_medium: { paddingVertical: SPACING.md },
  size_large: { paddingVertical: SPACING.lg },

  text: { fontWeight: '800', letterSpacing: 0.5 },
  text_primary: { color: '#000' },
  text_outline: { color: COLORS.accent },
  text_ghost: { color: COLORS.textSecondary },
  text_danger: { color: '#fff' },

  textSize_small: { fontSize: 13 },
  textSize_medium: { fontSize: 15 },
  textSize_large: { fontSize: 17 },
});
