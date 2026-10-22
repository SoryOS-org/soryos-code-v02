import { Spinner, type SpinnerVariantName } from "./spinner"
import { spinnerVariants } from "./spinner-variants"

const docs = `### Overview
Animated loading indicator for inline or page-level loading states. Tabs, \`Loader\`, \`ActivityRing\` and the
titlebar update button all render it.

### Variants and states
- Soft Radar by default; Soft Radar (smooth) glides its sweep head between dots instead of stepping.
- Today (the 5×5 PNG radar) and the other dot-matrix variations from Knobs → Experiments → Activity spinner; a
  \`variant\` prop pins one.

### Behavior
- CSS animation only. Every dot of a variation shares one loop, and \`syncSpinPhase\` pins every instance to the
  same start, so spinners on screen stay in phase.
- Reduced motion freezes each variation on a still pose.

### Accessibility
- Use alongside text or aria-live regions to convey loading state.
`

type Args = { variant: SpinnerVariantName; speed: number; size: number }

export default {
  title: "UI/Spinner",
  id: "components-spinner",
  component: Spinner,
  tags: ["autodocs"],
  args: { variant: "radar", speed: 1, size: 16 },
  argTypes: {
    variant: { control: "select", options: ["today", ...Object.keys(spinnerVariants)] },
    speed: { control: { type: "range", min: 0.25, max: 2, step: 0.05 } },
    size: { control: { type: "range", min: 12, max: 48, step: 1 } },
  },
  render: (args: Args) => (
    <Spinner
      variant={args.variant}
      style={{ width: `${args.size}px`, height: `${args.size}px`, "--spinner-time": String(1 / args.speed) }}
    />
  ),
  parameters: {
    docs: {
      description: {
        component: docs,
      },
    },
  },
}

export const Today = { args: { variant: "today" } }

export const SoftRadar = { args: { variant: "radar" } }

export const SoftRadarSmooth = { args: { variant: "radarSmooth" } }

export const OrbRadar = { args: { variant: "orbRadar" } }

export const CentreRipple = { args: { variant: "ripple" } }

export const BorderSnake = { args: { variant: "snake" } }

export const SpiralFill = { args: { variant: "spiral" } }

export const BreathingGrid = { args: { variant: "breathe" } }
