---
# template -> draft -> active -> complete
status: template
# Contract v2: every slot states the communication problem it solves.
contract_version: 2

# Written AFTER page structure exists, starting from COMMUNICATION NEEDS — not
# from empty space. Zero slots is a valid plan: less imagery beats irrelevant
# imagery. Field reference: visual/README.md ("Image plan"). Example slot, not real:
#
# - id: services-identity-diagram
#   page: /services/
#   section: how-it-works
#   role: explanatory diagram
#   communication_need: "Show that the website, Google profile, reviews and local
#     listings reinforce one consistent business identity."
#   medium: diagram                   # real-asset | generated-image | diagram | svg-illustration
#   evidence_class: generated-communication
#                                     # authentic-evidence: real jobs, staff, premises,
#                                     #   vehicles, products, reviews, data — never generated
#                                     # generated-communication: diagrams, concepts,
#                                     #   non-documentary imagery — never presented as proof
#                                     # decorative: sparingly, with decorative_justification
#   priority: P1                      # P1 | P2
#   depicts: illustration             # protected: client-work, staff, customers,
#                                     #   facility, fleet, client-product, documentary-proof
#                                     # open: place-context, atmosphere, material-texture,
#                                     #   illustration, abstract
#   real_asset_available: false
#   real_asset_path: ""
#   source: none-yet                  # real-client | real-brand | ai-generated | none-yet
#   generate_if_needed: false         # never true for authentic evidence
#   subject: "[what the visual must show]"
#   aspect_ratio: "16:9"
#   focal_point: "50% 50%"
#   crop_notes: "[how it changes from desktop to mobile; diagrams must stay legible]"
#   authenticity_constraints: "[what would make this visual dishonest]"
#   prompt_notes: ""                  # required when source is ai-generated
#   final_path: ""                    # required once approved or placed
#   status: planned                   # planned | needs-asset | generating | in-review
#                                     #   | approved | placed | dropped
slots: []
---

# Image Plan

> Written **after** the page structure exists. A visual earns a slot only when
> it **communicates** something — explains better than copy, shows a real part
> of the service or process, establishes useful context, materially improves
> comprehension or composition, or carries a brand signal without pretending
> to be evidence. Empty space is not a reason; **zero slots is a valid plan.**
> Precedence for evidence is fixed:
>
> **real client imagery > real business/brand assets > AI-generated supporting imagery**
>
> Never generate employees, customers, testimonials, completed client work,
> company facilities, branded fleet, client products, or anything that reads as
> documentary proof. Those slots stay `needs-asset` — a visible gap — until a
> real photograph exists. Missing photography forbids fabricating proof — it
> does **not** rule out diagrams, illustration or non-documentary imagery.
> `npm run design:check` enforces this.

## Notes

[FILL: sourcing status, outstanding requests to the client, pages where no
visual earned a slot (and why), and anything the image specialist must know]
