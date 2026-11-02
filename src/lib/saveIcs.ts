/*
 * The .ics straight to the phone, nowhere else: a Blob, an object URL, a
 * link with a download name, clicked (as the Sky panel's sky events). iOS
 * opens it in Calendar to add. Nothing is sent anywhere.
 */
export function saveIcs(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
