# Image Generation with Gemini (Nano Banana 🍌)

This document explains the enhanced image generation capabilities in the 1111 School app using the Gemini API.

## Overview

The app now supports advanced image generation features using Google's Gemini API (aka "Nano Banana"):

- **Two Model Options**: Choose between Flash (fast, 1024px) or Pro (high-quality, 4K)
- **Aspect Ratio Control**: Generate images in various aspect ratios
- **Google Search Grounding**: Pro model can use real-world data for accuracy
- **Batch Generation**: Create multiple variations at once
- **Automatic Fallback**: SVG visualization if API fails

## Models

### Gemini 2.5 Flash Image (Default)
- **Speed**: Optimized for fast generation
- **Resolution**: 1024px
- **Best for**: Quick lesson visuals, high-volume generation
- **Model ID**: `gemini-2.5-flash-image`

### Gemini 3 Pro Image Preview
- **Quality**: Professional-grade, 4K resolution
- **Features**: 
  - Google Search grounding for accuracy
  - "Thinking" process for better composition
  - Up to 4K resolution
- **Best for**: High-quality educational diagrams, complex visualizations
- **Model ID**: `gemini-3-pro-image-preview`

## Usage

### Basic Usage (Current Implementation)

```typescript
import { generateLessonVisual } from './services/visualGenerator';

const imageUrl = await generateLessonVisual(
  lesson,
  "A diagram showing Newton's law of gravitation",
  apiKey,
  { model: 'flash', aspectRatio: '16:9' }
);
```

### Advanced Options

```typescript
import { generateLessonVisual, ImageGenerationOptions } from './services/visualGenerator';

// High-quality 4K image with Google Search grounding
const options: ImageGenerationOptions = {
  model: 'pro',              // Use Pro model for 4K quality
  aspectRatio: '16:9',       // Widescreen format
  enableGrounding: true      // Use Google Search for accuracy
};

const imageUrl = await generateLessonVisual(
  lesson,
  "A scientifically accurate diagram of planetary orbits",
  apiKey,
  options
);
```

### Batch Generation

Generate multiple variations to choose from:

```typescript
import { generateLessonVisualBatch } from './services/visualGenerator';

const images = await generateLessonVisualBatch(
  lesson,
  "Different visual representations of gravity",
  apiKey,
  3,  // Generate 3 variations
  { model: 'flash', aspectRatio: '1:1' }
);

// images is an array of data URLs
```

## Aspect Ratios

Supported aspect ratios:
- `'1:1'` - Square (good for diagrams)
- `'16:9'` - Widescreen (default, good for presentations)
- `'9:16'` - Portrait (good for mobile)
- `'4:3'` - Traditional (good for slides)
- `'3:4'` - Portrait traditional

## Configuration in Store

The app currently uses Flash model with 16:9 aspect ratio for all lessons:

```typescript
// In useAppStore.ts
const visualUrl = await generateLessonVisual(
  lesson,
  visualPrompt,
  settings.apiKey,
  { model: 'flash', aspectRatio: '16:9' }
);
```

### Customization Ideas

You could enhance this by:

1. **User Preference**: Let users choose quality vs speed
2. **Adaptive Selection**: Use Pro for complex topics, Flash for simple ones
3. **Topic-Based Ratios**: Use different aspect ratios for different subjects
4. **Batch Preview**: Generate multiple options and let users pick

## Example Customizations

### Quality Toggle

```typescript
// Add to UserSettings
interface UserSettings {
  apiKey: string;
  userName: string;
  imageQuality?: 'fast' | 'high'; // New setting
}

// Use in generation
const visualUrl = await generateLessonVisual(
  lesson,
  visualPrompt,
  settings.apiKey,
  { 
    model: settings.imageQuality === 'high' ? 'pro' : 'flash',
    aspectRatio: '16:9' 
  }
);
```

### Topic-Based Configuration

```typescript
// Different configs for different topics
const getImageConfig = (topic: string): ImageGenerationOptions => {
  if (topic.includes('physics') || topic.includes('astronomy')) {
    return { model: 'pro', aspectRatio: '16:9', enableGrounding: true };
  }
  return { model: 'flash', aspectRatio: '16:9' };
};

const visualUrl = await generateLessonVisual(
  lesson,
  visualPrompt,
  settings.apiKey,
  getImageConfig(course.title)
);
```

## Error Handling

The system automatically falls back to SVG visualization if:
- API key is invalid
- Network error occurs
- API quota is exceeded
- Model is unavailable

The fallback SVG displays:
- Lesson title
- Visual concept description
- Styled with your app's color scheme
- Clear indication it's a fallback

## Performance Considerations

### Flash Model
- ⚡ Fast: ~2-3 seconds per image
- 💰 Cost-effective
- 📱 Good for mobile/responsive

### Pro Model
- 🎨 High quality: ~5-10 seconds per image
- 💎 Higher API cost
- 🖥️ Best for desktop/presentation

## API Documentation

Full documentation: https://ai.google.dev/gemini-api/docs/image-generation

## Future Enhancements

Potential features to add:
- [ ] Reference image support (up to 14 images)
- [ ] Image editing (text-and-image-to-image)
- [ ] Multi-turn image refinement
- [ ] Custom style presets
- [ ] Image caching for repeated prompts
