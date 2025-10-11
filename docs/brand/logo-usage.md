# YES GODDESS Logo Usage Guide

## Official Logo

The official YES GODDESS logo is located at:
```
/public/logo/yesgoddesslogo.png
```

**Important**: Always use this file for any logo display in the application. Do not create alternative versions or use placeholder images.

## Usage in React Components

### Using the Logo Component

The recommended way to display the logo is using the `<Logo>` component:

```tsx
import { Logo } from '@/components/ui';

// Default size (medium)
<Logo />

// Different sizes
<Logo size="sm" />   // 120x32px
<Logo size="md" />   // 180x48px (default)
<Logo size="lg" />   // 240x64px
<Logo size="xl" />   // 360x96px

// Text-only variant (fallback)
<Logo variant="text" />

// With priority loading (for above-the-fold logos)
<Logo size="lg" priority />
```

### Logo Variants

1. **Full Logo** (default): Displays the actual logo image
   ```tsx
   <Logo size="md" />
   ```

2. **Text Variant**: Uses "YES GODDESS" text styled with brand fonts
   ```tsx
   <Logo variant="text" size="lg" />
   ```

## Logo Sizes

| Size | Dimensions | Use Case |
|------|------------|----------|
| `sm` | 120x32px | Navigation bars, compact headers |
| `md` | 180x48px | Standard headers, email headers |
| `lg` | 240x64px | Page headers, feature sections |
| `xl` | 360x96px | Hero sections, landing pages |

## Usage in Email Templates

For email templates, use the logo with environment-aware URL:

```tsx
import { BRAND_LOGO } from '@/lib/constants/brand';

<Img
  src={`${process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com'}${BRAND_LOGO.path}`}
  width={BRAND_LOGO.email.header.width}
  height={BRAND_LOGO.email.header.height}
  alt={BRAND_LOGO.alt}
/>
```

Or use the `EmailLayout` component which handles this automatically:

```tsx
import { EmailLayout } from '@/emails/components/EmailLayout';

<EmailLayout previewText="Your preview text">
  {/* Your email content */}
</EmailLayout>
```

## Direct Image Usage

If you need to use Next.js Image component directly:

```tsx
import Image from 'next/image';
import { BRAND_LOGO } from '@/lib/constants/brand';

<Image
  src={BRAND_LOGO.path}
  alt={BRAND_LOGO.alt}
  width={BRAND_LOGO.sizes.md.width}
  height={BRAND_LOGO.sizes.md.height}
  priority
/>
```

## Logo Spacing Guidelines

### Minimum Clear Space
Maintain clear space around the logo equal to at least the height of one letter in the logo.

### Minimum Size
- **Digital**: Never display smaller than 80px width
- **Print**: Never display smaller than 0.5 inches width

## Logo Background

The logo works best on:
- ✅ White backgrounds (`#FFFFFF`)
- ✅ Warm white backgrounds (`#FAF8F5`)
- ✅ Black backgrounds (`#000000`)
- ✅ Cream backgrounds (`#F5E6D3`)

Ensure sufficient contrast when placing on colored backgrounds.

## What NOT to Do

❌ **Don't** modify the logo colors  
❌ **Don't** distort or stretch the logo  
❌ **Don't** add effects (shadows, glows, etc.)  
❌ **Don't** rotate the logo  
❌ **Don't** place on busy backgrounds  
❌ **Don't** use low-resolution versions  
❌ **Don't** recreate or redraw the logo  
❌ **Don't** use placeholder or temporary logos  

## File Locations

- **Logo Component**: `/src/components/ui/Logo.tsx`
- **Logo File**: `/public/logo/yesgoddesslogo.png`
- **Brand Constants**: `/src/lib/constants/brand.ts`
- **Email Layout**: `/emails/components/EmailLayout.tsx`

## Examples

### Header Logo
```tsx
<header className="bg-brand-black py-6">
  <Container>
    <Logo size="md" priority />
  </Container>
</header>
```

### Hero Section Logo
```tsx
<section className="text-center">
  <Logo size="xl" priority />
  <h1>Welcome to YES GODDESS</h1>
</section>
```

### Footer Logo
```tsx
<footer className="bg-brand-black text-brand-white py-12">
  <Logo size="sm" />
  <p>© {new Date().getFullYear()} YES GODDESS</p>
</footer>
```

### Admin Dashboard Header
```tsx
<header className="bg-brand-black border-b border-brand-gold">
  <div className="flex items-center gap-4">
    <Logo size="md" />
    <span className="text-brand-white">Admin Dashboard</span>
  </div>
</header>
```

## Accessibility

Always include the alt text "YES GODDESS" for screen readers:

```tsx
// The Logo component handles this automatically
<Logo size="md" />

// For direct Image usage
<Image src="/logo/yesgoddesslogo.png" alt="YES GODDESS" {...} />
```

## Performance

- Use `priority` prop for logos above the fold
- The Logo component uses Next.js Image optimization automatically
- Logos are served from `/public` directory for optimal caching

## Support

For questions about logo usage or to request different logo formats, contact the design team.
