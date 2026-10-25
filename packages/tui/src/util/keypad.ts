// Kitty's keyboard protocol reports the keypad under its own key names, so a keypad
// End arrives as `kpend` where the regular End key sends `end`. Keymap bindings cover
// this with their `kp*` defaults, but a handler that reads `event.name` directly sees
// the keypad name and its comparison misses.
const keypadNames: Record<string, string> = {
  kpup: "up",
  kpdown: "down",
  kpleft: "left",
  kpright: "right",
  kppageup: "pageup",
  kppagedown: "pagedown",
  kphome: "home",
  kpend: "end",
}

/** The keypad key's regular equivalent, or the name unchanged for every other key. */
export function keypadKeyName(name: string) {
  return keypadNames[name] ?? name
}
