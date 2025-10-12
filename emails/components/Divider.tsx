/**
 * YES GODDESS Email Divider Component
 * Horizontal rule for separating content sections
 */

import { Hr } from '@react-email/components';
import * as React from 'react';
import { EMAIL_COLORS } from '../styles/brand';

interface DividerProps {
  variant?: 'default' | 'gold';
}

export const Divider = ({ variant = 'default' }: DividerProps) => {
  const styles = {
    default: {
      borderTop: `1px solid ${EMAIL_COLORS.SANCTUM}`,
      margin: '24px 0',
      opacity: 0.2,
    },
    gold: {
      borderTop: `2px solid ${EMAIL_COLORS.ALTAR}`,
      margin: '32px 0',
    },
  };

  return <Hr style={styles[variant]} />;
};

export default Divider;
