import { Loader } from "./loader"

const docs = `### Overview
5×5 dot-grid loader for compact loading states.

### API
- Accepts standard SVG props.

### Behavior
- Reuses the previous session progress indicator's 36-frame, 1.2-second animation.

### Accessibility
- Sets \`aria-hidden="true"\` by default.
`

export default {
  title: "UI/Loader",
  id: "ui-loader",
  component: Loader,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs,
      },
    },
  },
}

export const Basic = {
  render: () => <Loader />,
}

export const Sizes = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", "align-items": "center" }}>
      <Loader width={12} height={12} />
      <Loader />
      <Loader width={24} height={24} />
    </div>
  ),
}
