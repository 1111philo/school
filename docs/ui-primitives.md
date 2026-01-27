# UI Primitives / Design System Documentation

This document provides comprehensive documentation for the UI primitives and design system used in this application. The design system is built on [shadcn/ui](https://ui.shadcn.com/), which provides accessible, customizable components built on top of Radix UI primitives and styled with Tailwind CSS.

---

## Table of Contents

1. [Overview](#overview)
2. [The `cn()` Utility Function](#the-cn-utility-function)
3. [Tailwind Configuration](#tailwind-configuration)
4. [Theming System](#theming-system)
5. [Global Styles](#global-styles)
6. [UI Primitives](#ui-primitives)
   - [Button](#button)
   - [Card](#card)
   - [Input](#input)
   - [Textarea](#textarea)
   - [Label](#label)
   - [ScrollArea](#scrollarea)
   - [Sheet](#sheet)

---

## Overview

### Architecture

The design system follows the shadcn/ui pattern:

- **Radix UI Primitives**: Provide unstyled, accessible components
- **Tailwind CSS**: Handles all styling through utility classes
- **Class Variance Authority (CVA)**: Manages component variants
- **CSS Variables**: Enable theming and dark mode support

### Key Dependencies

- `@radix-ui/react-*` - Headless UI primitives
- `class-variance-authority` - Variant management
- `clsx` - Conditional class construction
- `tailwind-merge` - Intelligent Tailwind class merging
- `tailwindcss-animate` - Animation utilities
- `@tailwindcss/typography` - Prose styling
- `lucide-react` - Icon library

---

## The `cn()` Utility Function

**File**: `src/lib/utils.ts`

The `cn()` function is the cornerstone utility for combining Tailwind classes safely and conditionally.

```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
```

### How It Works

1. **`clsx`**: Constructs className strings conditionally
2. **`twMerge`**: Intelligently merges Tailwind classes, resolving conflicts

### Usage Examples

```tsx
// Basic usage
cn("px-4 py-2", "bg-blue-500")
// => "px-4 py-2 bg-blue-500"

// Conditional classes
cn("base-class", isActive && "active-class", isDisabled && "opacity-50")
// => "base-class active-class" (if isActive is true)

// Override conflicting classes
cn("px-4 py-2", "px-8")
// => "py-2 px-8" (px-8 overrides px-4)

// With component className prop
cn(buttonVariants({ variant, size }), className)
```

### Why Use `cn()`?

- **Conflict Resolution**: `twMerge` ensures later classes override earlier conflicting ones
- **Conditional Classes**: `clsx` handles booleans, objects, and arrays
- **Type Safety**: Accepts `ClassValue` types from clsx

---

## Tailwind Configuration

**File**: `tailwind.config.js`

### Dark Mode

```javascript
darkMode: ["class"]
```

Dark mode is toggled by adding the `dark` class to a parent element (typically `<html>` or `<body>`).

### Content Paths

```javascript
content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
]
```

### Extended Theme

#### Border Radius

Uses CSS variables for consistent, customizable border radius:

```javascript
borderRadius: {
    lg: 'var(--radius)',           // 0.5rem (default)
    md: 'calc(var(--radius) - 2px)', // ~0.375rem
    sm: 'calc(var(--radius) - 4px)'  // ~0.25rem
}
```

#### Semantic Colors

All colors reference CSS variables wrapped in `hsl()`:

| Color | Default | Foreground |
|-------|---------|------------|
| `background` | Page background | - |
| `foreground` | Default text | - |
| `card` | Card background | Card text |
| `popover` | Popover background | Popover text |
| `primary` | Primary actions | Primary action text |
| `secondary` | Secondary actions | Secondary action text |
| `muted` | Muted backgrounds | Muted text |
| `accent` | Accent elements | Accent text |
| `destructive` | Destructive actions | Destructive action text |
| `border` | Border color | - |
| `input` | Input borders | - |
| `ring` | Focus rings | - |

#### Chart Colors

Five chart colors for data visualization:

```javascript
chart: {
    '1': 'hsl(var(--chart-1))',
    '2': 'hsl(var(--chart-2))',
    '3': 'hsl(var(--chart-3))',
    '4': 'hsl(var(--chart-4))',
    '5': 'hsl(var(--chart-5))'
}
```

### Plugins

```javascript
plugins: [
    require("tailwindcss-animate"),  // Animation utilities
    require("@tailwindcss/typography") // Prose/article styling
]
```

---

## Theming System

**File**: `src/index.css`

The theming system uses CSS custom properties (variables) in HSL format without the `hsl()` wrapper, allowing for flexible opacity adjustments.

### Light Theme (Default)

```css
:root {
    --background: 0 0% 100%;           /* White */
    --foreground: 222.2 84% 4.9%;      /* Near black */
    --card: 0 0% 100%;                  /* White */
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;      /* Dark blue */
    --primary-foreground: 210 40% 98%; /* Light */
    --secondary: 210 40% 96.1%;        /* Light gray-blue */
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;      /* Red */
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;       /* Light gray */
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
    /* Chart colors for light mode */
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
}
```

### Dark Theme

Activated by adding `class="dark"` to a parent element:

```css
.dark {
    --background: 222.2 84% 4.9%;      /* Near black */
    --foreground: 210 40% 98%;          /* Near white */
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;             /* Light (inverted) */
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;       /* Darker red */
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
    /* Chart colors for dark mode */
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
}
```

### Implementing Theme Toggle

To toggle between light and dark mode:

```tsx
// Add/remove 'dark' class on document element
document.documentElement.classList.toggle('dark')

// Or set explicitly
document.documentElement.classList.add('dark')    // Enable dark mode
document.documentElement.classList.remove('dark') // Enable light mode
```

---

## Global Styles

**File**: `src/index.css`

### Base Layer Styles

```css
@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
  }
}
```

These ensure:
- All elements use the semantic `border` color by default
- The body uses the semantic `background` and `foreground` colors

---

## UI Primitives

### Button

**File**: `src/components/ui/button.tsx`

A versatile button component with multiple variants and sizes.

#### Variants

| Variant | Description | Classes |
|---------|-------------|---------|
| `default` | Primary action button | `bg-primary text-primary-foreground hover:bg-primary/90` |
| `destructive` | Dangerous actions | `bg-destructive text-destructive-foreground hover:bg-destructive/90` |
| `outline` | Bordered button | `border border-input bg-background hover:bg-accent hover:text-accent-foreground` |
| `secondary` | Secondary actions | `bg-secondary text-secondary-foreground hover:bg-secondary/80` |
| `ghost` | Minimal button | `hover:bg-accent hover:text-accent-foreground` |
| `link` | Text link style | `text-primary underline-offset-4 hover:underline` |

#### Sizes

| Size | Dimensions |
|------|------------|
| `default` | `h-10 px-4 py-2` |
| `sm` | `h-9 px-3` |
| `lg` | `h-11 px-8` |
| `icon` | `h-10 w-10` (square) |

#### Props

```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean // Render as child element (for composition)
}
```

#### Usage Examples

```tsx
import { Button } from "@/components/ui/button"

// Default button
<Button>Click me</Button>

// With variants
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Learn more</Button>

// With sizes
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><IconComponent /></Button>

// As a link (using asChild)
<Button asChild>
    <a href="/path">Navigate</a>
</Button>

// Combining props
<Button variant="destructive" size="sm" disabled>
    Disabled Delete
</Button>
```

#### Base Styles

All buttons include:
- `inline-flex items-center justify-center` - Flexbox centering
- `whitespace-nowrap` - Prevent text wrapping
- `rounded-md` - Border radius
- `text-sm font-medium` - Typography
- `ring-offset-background transition-colors` - Transitions
- `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` - Focus states
- `disabled:pointer-events-none disabled:opacity-50` - Disabled states

---

### Card

**File**: `src/components/ui/card.tsx`

A compound component for content containers with header, body, and footer sections.

#### Components

| Component | Purpose | Default Classes |
|-----------|---------|-----------------|
| `Card` | Container | `rounded-lg border bg-card text-card-foreground shadow-sm` |
| `CardHeader` | Header section | `flex flex-col space-y-1.5 p-6` |
| `CardTitle` | Title (h3) | `text-2xl font-semibold leading-none tracking-tight` |
| `CardDescription` | Subtitle | `text-sm text-muted-foreground` |
| `CardContent` | Main content | `p-6 pt-0` |
| `CardFooter` | Footer section | `flex items-center p-6 pt-0` |

#### Usage Examples

```tsx
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"

// Basic card
<Card>
    <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here</CardDescription>
    </CardHeader>
    <CardContent>
        <p>Main content of the card</p>
    </CardContent>
    <CardFooter>
        <Button>Action</Button>
    </CardFooter>
</Card>

// Minimal card
<Card>
    <CardContent className="pt-6">
        <p>Simple content-only card</p>
    </CardContent>
</Card>

// Custom styling
<Card className="w-[350px]">
    <CardHeader className="pb-2">
        <CardTitle className="text-lg">Compact Title</CardTitle>
    </CardHeader>
    <CardContent>
        {/* Content */}
    </CardContent>
</Card>
```

---

### Input

**File**: `src/components/ui/input.tsx`

A styled text input component.

#### Props

```typescript
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
```

Accepts all standard HTML input attributes.

#### Default Styles

- `flex h-10 w-full` - Sizing
- `rounded-md border border-input` - Border
- `bg-background` - Background
- `px-3 py-2 text-sm` - Padding and typography
- `ring-offset-background` - Focus ring offset
- `file:border-0 file:bg-transparent file:text-sm file:font-medium` - File input styling
- `placeholder:text-muted-foreground` - Placeholder color
- `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` - Focus states
- `disabled:cursor-not-allowed disabled:opacity-50` - Disabled states

#### Usage Examples

```tsx
import { Input } from "@/components/ui/input"

// Basic input
<Input placeholder="Enter text..." />

// With type
<Input type="email" placeholder="Email address" />
<Input type="password" placeholder="Password" />
<Input type="number" min={0} max={100} />

// Controlled input
<Input
    value={value}
    onChange={(e) => setValue(e.target.value)}
/>

// With custom className
<Input className="max-w-sm" placeholder="Limited width" />

// Disabled state
<Input disabled placeholder="Cannot edit" />

// File input
<Input type="file" accept="image/*" />
```

---

### Textarea

**File**: `src/components/ui/textarea.tsx`

A styled multiline text input component.

#### Props

```typescript
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
```

Accepts all standard HTML textarea attributes.

#### Default Styles

- `flex min-h-[80px] w-full` - Minimum height and full width
- `rounded-md border border-input` - Border
- `bg-background` - Background
- `px-3 py-2 text-sm` - Padding and typography
- `ring-offset-background` - Focus ring offset
- `placeholder:text-muted-foreground` - Placeholder color
- `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` - Focus states
- `disabled:cursor-not-allowed disabled:opacity-50` - Disabled states

#### Usage Examples

```tsx
import { Textarea } from "@/components/ui/textarea"

// Basic textarea
<Textarea placeholder="Enter your message..." />

// With rows
<Textarea rows={6} placeholder="Longer content area" />

// Controlled
<Textarea
    value={message}
    onChange={(e) => setMessage(e.target.value)}
/>

// Custom height
<Textarea className="min-h-[200px]" placeholder="Large text area" />

// Disabled
<Textarea disabled value="Read-only content" />
```

---

### Label

**File**: `src/components/ui/label.tsx`

An accessible label component built on Radix UI's Label primitive.

#### Default Styles

- `text-sm font-medium leading-none` - Typography
- `peer-disabled:cursor-not-allowed peer-disabled:opacity-70` - Disabled peer styling

#### Usage Examples

```tsx
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

// Basic label
<Label htmlFor="email">Email</Label>
<Input id="email" type="email" />

// With peer styling (input must have 'peer' class)
<div className="grid gap-2">
    <Label htmlFor="username">Username</Label>
    <Input id="username" className="peer" disabled />
</div>

// Required field indication
<Label htmlFor="name">
    Name <span className="text-destructive">*</span>
</Label>

// Custom styling
<Label className="text-base" htmlFor="title">Title</Label>
```

---

### ScrollArea

**File**: `src/components/ui/scroll-area.tsx`

A custom scrollable area with styled scrollbars, built on Radix UI's ScrollArea primitive.

#### Components

| Component | Purpose | Description |
|-----------|---------|-------------|
| `ScrollArea` | Container | Wraps content with custom scrollbars |
| `ScrollBar` | Scrollbar | Customizable scrollbar component |

#### ScrollBar Props

```typescript
interface ScrollBarProps {
    orientation?: "vertical" | "horizontal" // Default: "vertical"
    // Plus all Radix ScrollAreaScrollbar props
}
```

#### Default Styles

**ScrollArea:**
- `relative overflow-hidden`

**ScrollBar (vertical):**
- `h-full w-2.5 border-l border-l-transparent p-[1px]`

**ScrollBar (horizontal):**
- `h-2.5 flex-col border-t border-t-transparent p-[1px]`

**Thumb:**
- `relative flex-1 rounded-full bg-border`

#### Usage Examples

```tsx
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

// Vertical scroll
<ScrollArea className="h-[200px] w-[350px] rounded-md border p-4">
    <div className="space-y-4">
        {items.map((item) => (
            <div key={item.id}>{item.content}</div>
        ))}
    </div>
</ScrollArea>

// Horizontal scroll
<ScrollArea className="w-96 whitespace-nowrap rounded-md border">
    <div className="flex w-max space-x-4 p-4">
        {items.map((item) => (
            <div key={item.id} className="w-[150px]">{item.content}</div>
        ))}
    </div>
    <ScrollBar orientation="horizontal" />
</ScrollArea>

// Both directions
<ScrollArea className="h-[300px] w-[400px] rounded-md border">
    <div className="w-[800px] p-4">
        {/* Wide content */}
    </div>
    <ScrollBar orientation="horizontal" />
</ScrollArea>
```

---

### Sheet

**File**: `src/components/ui/sheet.tsx`

A slide-out panel component built on Radix UI's Dialog primitive. Commonly used for mobile navigation, forms, or detail views.

#### Components

| Component | Purpose |
|-----------|---------|
| `Sheet` | Root component (controlled/uncontrolled state) |
| `SheetTrigger` | Element that opens the sheet |
| `SheetContent` | The slide-out panel content |
| `SheetHeader` | Container for title and description |
| `SheetTitle` | Sheet title |
| `SheetDescription` | Sheet description |
| `SheetFooter` | Footer with actions |
| `SheetClose` | Close button/trigger |
| `SheetPortal` | Portal for rendering |
| `SheetOverlay` | Background overlay |

#### Side Variants

```typescript
type Side = "top" | "bottom" | "left" | "right" // Default: "right"
```

| Side | Behavior |
|------|----------|
| `top` | Slides in from top, full width |
| `bottom` | Slides in from bottom, full width |
| `left` | Slides in from left, 75% width (max `sm:max-w-sm`) |
| `right` | Slides in from right, 75% width (max `sm:max-w-sm`) |

#### Animations

- **Overlay**: Fade in/out
- **Content**: Slide in/out based on `side`
- **Open duration**: 500ms
- **Close duration**: 300ms

#### Usage Examples

```tsx
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetFooter,
    SheetClose,
} from "@/components/ui/sheet"

// Basic sheet (right side)
<Sheet>
    <SheetTrigger asChild>
        <Button variant="outline">Open Menu</Button>
    </SheetTrigger>
    <SheetContent>
        <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>
                Navigation and settings
            </SheetDescription>
        </SheetHeader>
        <div className="py-4">
            {/* Sheet content */}
        </div>
        <SheetFooter>
            <SheetClose asChild>
                <Button variant="outline">Close</Button>
            </SheetClose>
        </SheetFooter>
    </SheetContent>
</Sheet>

// Left side navigation
<Sheet>
    <SheetTrigger asChild>
        <Button size="icon" variant="ghost">
            <MenuIcon className="h-5 w-5" />
        </Button>
    </SheetTrigger>
    <SheetContent side="left">
        <nav className="flex flex-col space-y-4">
            <a href="/">Home</a>
            <a href="/about">About</a>
            <a href="/contact">Contact</a>
        </nav>
    </SheetContent>
</Sheet>

// Bottom sheet (mobile-friendly)
<Sheet>
    <SheetTrigger asChild>
        <Button>Show Options</Button>
    </SheetTrigger>
    <SheetContent side="bottom" className="h-[400px]">
        <SheetHeader>
            <SheetTitle>Options</SheetTitle>
        </SheetHeader>
        {/* Options content */}
    </SheetContent>
</Sheet>

// Controlled sheet
const [open, setOpen] = useState(false)

<Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild>
        <Button>Open</Button>
    </SheetTrigger>
    <SheetContent>
        {/* Content */}
        <Button onClick={() => setOpen(false)}>
            Custom Close
        </Button>
    </SheetContent>
</Sheet>
```

---

## Design Tokens Summary

### Spacing

Uses Tailwind's default spacing scale. Common values:
- `p-6` - Standard padding for cards/sheets
- `space-y-1.5` - Tight vertical spacing (card header)
- `space-y-2` - Standard vertical spacing (sheet header)

### Typography

- **Headings**: `text-2xl font-semibold` (CardTitle), `text-lg font-semibold` (SheetTitle)
- **Body**: `text-sm` (default)
- **Muted**: `text-sm text-muted-foreground` (descriptions)

### Border Radius

Controlled by `--radius` variable (default: `0.5rem`):
- `rounded-lg` - Large radius (cards)
- `rounded-md` - Medium radius (buttons, inputs)
- `rounded-sm` - Small radius
- `rounded-full` - Circular (scrollbar thumb)

### Shadows

- `shadow-sm` - Subtle shadow (cards)
- `shadow-lg` - Larger shadow (sheets)

### Focus States

Consistent across all interactive elements:
```css
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-ring
focus-visible:ring-offset-2
```

### Disabled States

Consistent across all interactive elements:
```css
disabled:pointer-events-none
disabled:opacity-50
disabled:cursor-not-allowed
```

---

## Best Practices

### 1. Always Use `cn()` for Class Composition

```tsx
// Good
<Button className={cn("custom-class", conditionalClass && "conditional")} />

// Avoid
<Button className={`custom-class ${conditionalClass ? "conditional" : ""}`} />
```

### 2. Leverage Semantic Colors

```tsx
// Good - uses semantic colors that adapt to theme
<div className="bg-background text-foreground">

// Avoid - hardcoded colors don't respect theme
<div className="bg-white text-black">
```

### 3. Use the `asChild` Pattern for Composition

```tsx
// Render Button styles on an anchor tag
<Button asChild>
    <a href="/path">Link styled as button</a>
</Button>
```

### 4. Extend Components Rather Than Override

```tsx
// Good - extend with className
<Card className="w-[350px] border-primary">

// Avoid - creating wrapper components for simple styling
const CustomCard = () => <div className="..."><Card>...</Card></div>
```

### 5. Form Field Pattern

```tsx
<div className="grid gap-2">
    <Label htmlFor="field-id">Field Label</Label>
    <Input id="field-id" />
    <p className="text-sm text-muted-foreground">Helper text</p>
</div>
```
