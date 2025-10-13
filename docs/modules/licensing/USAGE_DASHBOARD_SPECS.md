# License Usage Dashboard - Admin Interface Specifications

## Overview

Admin dashboard for monitoring and managing license usage tracking. Built following YES GODDESS brand guidelines with VOID, BONE, ALTAR, and SANCTUM color palette.

## Dashboard Sections

### 1. License Usage Overview

**Route:** `/admin/licenses/[licenseId]/usage`

**Key Metrics Cards:**
- **Current Period Usage** - Large numbers in BONE on VOID background
- **Usage vs. Limit** - Progress indicator with ALTAR gold at thresholds
- **Revenue Generated** - Usage-based earnings
- **Days Until Limit** - Based on forecast

**Design Specifications:**
- Card backgrounds: SHADOW (#0F0F0F)
- Primary text: BONE (#F8F6F3)
- Labels: SANCTUM (#C4C0B8)
- Accent: ALTAR gold (#B8A888) for important numbers
- Warning states: CAUTION orange for approaching limits
- Critical states: DENY rust red for overages

### 2. Usage Analytics Chart

**Visualization Requirements:**
- **Time Series Line Chart** showing usage trends
- **Granularity Toggle**: Daily / Weekly / Monthly
- **Usage Type Filter**: All, Views, Downloads, Impressions, etc.
- **Comparison Toggle**: Show previous period overlay

**Chart Styling (YES GODDESS Brand):**
```css
chart: {
  background: '#0A0A0A', // VOID
  grid: {
    color: '#2A2A2A',
    borderColor: '#C4C0B8', // SANCTUM
  },
  line: {
    primary: '#B8A888', // ALTAR gold
    comparison: '#C4C0B8', // SANCTUM (dimmed)
  },
  labels: {
    color: '#F8F6F3', // BONE
    font: 'Inter, sans-serif',
  }
}
```

### 3. Threshold Status Section

**Display Elements:**
- **Threshold Cards** - One per configured threshold
- **Progress Bars** - Visual representation of usage vs. limit
- **Warning Badges** - 50%, 75%, 90%, 100% thresholds
- **Grace Period Indicator** - If applicable

**Card Structure:**
```tsx
<ThresholdCard>
  <Header>
    <UsageType>Impressions</UsageType>
    <PercentageUsed color={getStatusColor(83)}>83%</PercentageUsed>
  </Header>
  <ProgressBar value={83000} max={100000} grace={110000} />
  <Details>
    <Current>83,000 / 100,000</Current>
    <Grace>+10,000 grace</Grace>
    <Remaining>17,000 remaining</Remaining>
  </Details>
  <ForecastNote>
    Projected to reach limit in 8 days
  </ForecastNote>
</ThresholdCard>
```

**Color Logic:**
- 0-50%: SANCTUM gray (normal)
- 50-75%: ALTAR gold (attention)
- 75-90%: CAUTION orange (warning)
- 90-100%: DENY rust red (critical)
- >100%: DENY rust red + bold (overage)

### 4. Usage Breakdown Table

**Columns:**
- Date / Period
- Usage Type
- Quantity
- Platform Distribution
- Revenue Generated
- Status

**Interactions:**
- **Sortable** by any column
- **Filterable** by usage type, platform, date range
- **Exportable** to CSV
- **Drill-down** to view raw events (admin only)

**Table Styling:**
```css
table: {
  background: '#0A0A0A',
  headerBg: '#0F0F0F',
  border: '#2A2A2A',
  headerText: '#B8A888', // ALTAR gold
  bodyText: '#F8F6F3', // BONE
  hoverBg: '#1A1A1A',
}
```

### 5. Top Sources & Platforms

**Side Panel Layout:**

**Top Referrers:**
- Horizontal bar chart
- Show top 10 sources
- Display count and percentage
- Click to filter main chart

**Platform Distribution:**
- Donut chart or simple list
- Web, Mobile, TV, Print, Social
- Percentage breakdown
- ALTAR gold for largest segment

**Geographic Distribution:**
- List with country codes
- Top 20 locations
- Bar indicators for volume
- Optional: World map visualization (subtle, monochromatic)

### 6. Overage Management Section

**Route:** `/admin/licenses/[licenseId]/usage/overages`

**Overage Cards:**
```tsx
<OverageCard>
  <Header>
    <Badge color="red">Overage Detected</Badge>
    <Date>Oct 10, 2024</Date>
  </Header>
  <Details>
    <UsageType>Downloads</UsageType>
    <Overage>1,250 over limit</Overage>
    <CalculatedFee>$125.00</CalculatedFee>
  </Details>
  <Actions>
    {status === 'DETECTED' && (
      <>
        <Button variant="outline">Dispute</Button>
        <Button variant="primary">Approve & Bill</Button>
      </>
    )}
    {status === 'APPROVED' && (
      <StatusBadge>Approved - Pending Billing</StatusBadge>
    )}
  </Actions>
</OverageCard>
```

**Bulk Actions:**
- Select multiple overages
- Bulk approve
- Bulk dispute
- Export overage report

### 7. Forecast Dashboard

**Forecast Cards:**
- **Predicted Usage** - Next 30 days
- **Confidence Interval** - Upper/lower bounds
- **Breach Prediction** - Date and probability
- **Recommendation** - Action items

**Forecast Chart:**
- Historical data (solid line, ALTAR gold)
- Forecasted data (dashed line, ALTAR gold at 60% opacity)
- Confidence band (shaded area, SANCTUM at 20% opacity)
- Threshold line (horizontal, DENY rust red)
- Predicted breach point (marker, CAUTION orange)

### 8. Actions & Settings

**Quick Actions:**
- **Configure Threshold** - Modal to set limits
- **Generate Report** - Usage report for period
- **Download Data** - Export CSV/JSON
- **Forecast Analysis** - Run new forecast

**Threshold Configuration Modal:**
```tsx
<Modal title="Configure Usage Threshold">
  <Form>
    <Select label="Usage Type" options={usageTypes} />
    <Input label="Limit Quantity" type="number" />
    <Select label="Period Type" options={['daily', 'weekly', 'monthly']} />
    <Input label="Grace Percentage" type="number" suffix="%" />
    
    <Divider />
    
    <CheckboxGroup label="Send Warnings At">
      <Checkbox label="50% of limit" defaultChecked />
      <Checkbox label="75% of limit" defaultChecked />
      <Checkbox label="90% of limit" defaultChecked />
      <Checkbox label="100% of limit (at limit)" defaultChecked />
    </CheckboxGroup>
    
    <Divider />
    
    <Toggle label="Allow Overage" />
    {allowOverage && (
      <Input 
        label="Overage Rate" 
        type="number" 
        prefix="$" 
        suffix="per unit" 
        step="0.01"
      />
    )}
    
    <ButtonGroup>
      <Button variant="outline" onClick={cancel}>Cancel</Button>
      <Button variant="primary" onClick={save}>Save Threshold</Button>
    </ButtonGroup>
  </Form>
</Modal>
```

## Component Styling Guidelines

### Typography
- **Headings**: 
  - H1: 36px, Light (300), BONE, tracking +300
  - H2: 24px, Regular (400), BONE, tracking +200
  - H3: 18px, Medium (500), BONE, tracking +150
- **Body**: 14px, Regular (400), SANCTUM
- **Numbers**: 32px, Light (300), ALTAR gold (for primary metrics)
- **Labels**: 12px, Medium (500), SANCTUM, uppercase, tracking +100

### Spacing
- **Card padding**: 24px
- **Section margins**: 32px
- **Element spacing**: 16px
- **Tight spacing**: 8px

### Interactive Elements
- **Buttons**:
  - Primary: ALTAR gold bg, VOID text, hover: lighten 10%
  - Outline: SANCTUM border, BONE text, hover: ALTAR gold border
  - Danger: DENY rust red bg, BONE text
- **Inputs**:
  - Background: SHADOW
  - Border: SANCTUM
  - Focus: ALTAR gold border
  - Text: BONE
  - Placeholder: SANCTUM at 60%

### Status Indicators
- **Normal**: SANCTUM gray
- **Attention**: ALTAR gold
- **Warning**: CAUTION orange (#C9A66B)
- **Critical**: DENY rust red (#8B5A4A)
- **Success**: AFFIRM green (#6B8B69)

## Data Refresh Strategy

- **Real-time Updates**: Not required (avoid unnecessary load)
- **Auto-refresh**: Every 5 minutes for current usage
- **Manual Refresh**: Button to force immediate refresh
- **Cache Indicators**: Show "Last updated: 2 minutes ago"

## Responsive Design

- **Desktop First**: Primary use case
- **Tablet**: Stack cards, maintain readability
- **Mobile**: Vertical layout, simplified charts

## Performance Considerations

- **Lazy Load**: Charts only render when visible
- **Virtual Scrolling**: For large tables
- **Pagination**: Tables >100 rows
- **Debounce**: Filters and search inputs (300ms)

## Accessibility

- **Keyboard Navigation**: Full support
- **Screen Readers**: ARIA labels on all interactive elements
- **Color Contrast**: All text meets WCAG AA standards
- **Focus Indicators**: Clear focus states (ALTAR gold outline)

## Example API Usage

```typescript
// In React component
import { trpc } from '@/lib/trpc';

function UsageDashboard({ licenseId }: { licenseId: string }) {
  const { data: analytics } = trpc.usage.getAnalytics.useQuery({
    licenseId,
    startDate: startOfMonth(new Date()),
    endDate: new Date(),
    granularity: 'daily',
    compareWithPreviousPeriod: true,
  });

  const { data: thresholds } = trpc.usage.getThresholdStatus.useQuery({
    licenseId,
  });

  const { data: forecasts } = trpc.usage.getForecasts.useQuery({
    licenseId,
    limit: 5,
  });

  return (
    <div className="dashboard">
      <MetricsOverview metrics={analytics?.currentPeriod} />
      <UsageChart trends={analytics?.trends} />
      <ThresholdStatus thresholds={thresholds} />
      <ForecastPanel forecasts={forecasts} />
    </div>
  );
}
```

## Testing Checklist

- [ ] All metrics display correctly
- [ ] Charts render with proper brand styling
- [ ] Threshold warnings appear at correct percentages
- [ ] Overage approval flow works
- [ ] Forecast displays with confidence intervals
- [ ] Export functionality works
- [ ] Filters apply correctly
- [ ] Mobile layout is usable
- [ ] Accessibility standards met
- [ ] Performance is acceptable (<2s initial load)
