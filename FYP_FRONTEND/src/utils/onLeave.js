/**
 * Wraps a "check this field when the person leaves it" handler.
 *
 * Why: when the person leaves a field by pressing a button (Save, Resolve ...), the error message that the check shows
 * pushes the button down the screen before the mouse is released, and the click is lost - the person has to press
 * twice. The button runs the full check itself, so nothing is lost by skipping this one.
 */
export function onLeave(handler) {
  return (event) => {
    if (event?.relatedTarget?.tagName === 'BUTTON') return
    handler(event)
  }
}
