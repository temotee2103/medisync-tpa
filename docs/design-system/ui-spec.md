# UI Spec (Glass System)

## Color and spacing
- Borders: slate-200 baseline; slate-100 for subtle separators
- Focus: ring-sky-500/50 with ring-offset-slate-50
- Radius: inputs 12px, cards 16px–24px, badges 9999px

## Buttons
- Primary: `GlassButton` default
- Secondary: `GlassButton variant="secondary"`
- Ghost: `GlassButton variant="ghost"`

## Inputs
- Text/date/number/file use `GlassInput`
- Select uses `GlassSelect`
- Labels are always visible (no placeholder-only forms)

## Tables
- Desktop: header row with uppercase tracking, zebra hover, right-aligned action column
- Mobile: `MobileRecordCard` with slots

## Formatting
- Dates: use `formatDateDisplay`
- Currency: use `formatCurrency` and `.currency-input`
