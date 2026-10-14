/**
 * The server adds a sentence about the email to its message ("An email was sent to x." / "The email to x could not be sent. ...").
 * This returns that part (with a leading space) so screens that write their own notice can keep it. Empty when there is none.
 */
export function emailSentence(result) {
  const message = result?.message ?? ''
  const start = message.search(/ (An|A welcome|The) (welcome )?email/)
  return start === -1 ? '' : message.slice(start)
}
