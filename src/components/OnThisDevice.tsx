/**
 * WHERE ANY OF THIS ACTUALLY LIVES.
 *
 * WHAT WAS REPORTED. "Gear and spots live on one device. Say so. Nothing
 * syncs and clearing Safari data wipes it. I did not know that. It is a
 * feature, not an apology, but I need to know before I rely on it."
 *
 * Both screens already said "saved on this device". Neither said the two
 * things that follow from it, which are the only parts anybody needs to act
 * on: it does not appear on your other phone, and clearing browsing data
 * takes it with everything else.
 *
 * SAID AS THE FEATURE IT IS. There is no account because there is no server,
 * and there is no server because the venue coordinate is the one thing this
 * app exists not to send anywhere. The export is the backup story and it is
 * deliberate, not a gap: a file the shooter owns, put wherever they like.
 *
 * ONE COMPONENT, so the kit screen and the spots list cannot drift into
 * telling two different stories about the same localStorage.
 */
export function OnThisDevice({ what }: { what: string }) {
  return (
    <p className="device">
      <span className="device__head">On this device only.</span> Your {what} are
      saved in this browser. There is no account and no server, which is why the
      venue never leaves the phone. It also means it does not appear on your
      other devices, and clearing this browser&rsquo;s data erases it. Export to
      a file to keep a copy you own.
    </p>
  )
}
