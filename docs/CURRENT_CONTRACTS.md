# RoomMuse contracts and compatibility

The audited route contract is home -> capture -> style -> generating -> result -> shopping. `POST /api/design` continues to accept `{ imageBase64, style }` and return one legacy concept. Retailer URLs and item checkboxes remain item-level behaviors.

The client normalizes the legacy response into a project with three concepts. Every added field is optional at the read boundary and receives a safe default. Persistence writes `roommuse.project.v2`; the original `roommuse.concept` key remains readable and is never deleted. This additive storage migration is reversible and requires no database change. Totals are derived from current item data.

