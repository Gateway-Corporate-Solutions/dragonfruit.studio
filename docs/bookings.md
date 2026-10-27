# Appointment Bookings

Calendar and Schedule share one website-wide appointment resource. Generate
availability in Commerce API > Schedule. Leave the external booking link empty
for native reservations. Existing HTTPS links still delegate reservations,
notifications, and conflict prevention to that provider.

Set Business email under Booking notifications. Native reservations collect a
customer name, email, and optional notes. Confirmation includes an Add to calendar
download. The business notification includes the appointment times in UTC,
customer details, notes, a Google Calendar link, and an ICS attachment compatible
with Apple Calendar and Outlook.

## Exported Server Setup

Both Fresh and React exports include the booking backend. Configure these
server-only environment variables before accepting native reservations:

| Variable | Purpose |
| --- | --- |
| PUBLIC_ORIGIN | Exact public HTTPS origin |
| RESEND_API_KEY | Resend API credential |
| BOOKINGS_EMAIL_FROM | Verified Resend sender |
| BOOKINGS_EMAIL_TO | Optional override for the editor's Business email |
| BOOKINGS_FILE | Absolute persistent JSON file path; defaults to .dragonfruit/bookings.json |

The server needs read/write access to the storage directory. Use a persistent
volume across deploys. All server processes serving the same website must share
the same file and filesystem with atomic exclusive creation and rename. Isolated
replicas or serverless filesystems are not supported by this storage adapter.
Use a transactional shared database adapter before deploying across independent
hosts. A lock abandoned by a killed process fails closed: stop all booking
processes and remove only the adjacent .lock file before restarting. Never remove
the reservation JSON file to clear a lock. Back it up and restrict access because
it contains customer information.

The server checks the current configured slot, rejects past appointments, and
atomically reserves against every overlapping native booking, including bookings
whose slot has since been edited or removed. Adjacent appointments are allowed.
Changing or deleting availability does not cancel an existing reservation. The
current implementation assumes a single business resource, not multiple staff
members or group capacity.

Reservations persist before email delivery. Email failures do not release an
appointment or invite a second booking. The confirmation shows delayed delivery
and offers Retry business notification with the same request ID. Delivery is
idempotent at Resend; there is no background retry worker. Monitor mail delivery
and booking storage operationally. The endpoint applies a per-process request
limit; add edge abuse protection as appropriate for public traffic.

Editor previews never reserve appointments or send emails. Static-only hosting
cannot accept native reservations without the generated backend.