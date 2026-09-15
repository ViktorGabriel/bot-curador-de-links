import { describe, it, expect } from 'vitest';
import {
  resolveCategoryByEmoji,
  resolveCategoryByUrl,
  determineCategory,
  CATEGORIES,
} from '../../src/utils/categoryHelper.js';

describe('categoryHelper', () => {
  describe('resolveCategoryByEmoji', () => {
    it('deve mapear emoji dev para categoria dev', () => {
      expect(resolveCategoryByEmoji('💻')).toBe('dev');
    });

    it('deve mapear emoji de design para design', () => {
      expect(resolveCategoryByEmoji('🎨')).toBe('design');
    });

    it('deve retornar null para emojis não mapeados', () => {
      expect(resolveCategoryByEmoji('🚀')).toBeNull();
      expect(resolveCategoryByEmoji('')).toBeNull();
    });
  });

  describe('resolveCategoryByUrl', () => {
    it('deve classificar github como dev', () => {
      expect(resolveCategoryByUrl('https://github.com/nodejs/node')).toBe('dev');
    });

    it('deve classificar figma como design', () => {
      expect(resolveCategoryByUrl('https://www.figma.com/file/123')).toBe('design');
    });

    it('deve classificar youtube como video', () => {
      expect(resolveCategoryByUrl('https://www.youtube.com/watch?v=abc')).toBe('video');
    });

    it('deve classificar medium como reading', () => {
      expect(resolveCategoryByUrl('https://medium.com/@autor/post-1')).toBe('reading');
    });

    it('deve retornar general para domínios desconhecidos', () => {
      expect(resolveCategoryByUrl('https://meusite.com.br/artigo')).toBe('general');
    });
  });

  describe('determineCategory', () => {
    it('deve priorizar emoji temático sobre a URL', () => {
      // Reagiu com vídeo num link do github -> deve respeitar o emoji 🎥
      const category = determineCategory({
        emoji: '🎥',
        url: 'https://github.com/facebook/react',
      });
      expect(category.key).toBe('video');
      expect(category.color).toBe(CATEGORIES.video.color);
    });

    it('deve usar heurística de URL quando emoji for o geral 📌', () => {
      const category = determineCategory({
        emoji: '📌',
        url: 'https://github.com/facebook/react',
      });
      expect(category.key).toBe('dev');
    });

    it('deve retornar general se nem emoji nem url forem temáticos', () => {
      const category = determineCategory({
        emoji: '📌',
        url: 'https://exemplo.com/pagina',
      });
      expect(category.key).toBe('general');
    });
  });
});
