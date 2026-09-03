// ─────────────────────────────────────────────────────────────────────────────
//  THE WORDS ON THE RECOLLECTION DOOR — write these yourself.
//
//  This file is only text. Editing it changes what the "Are you Catholic?"
//  dialog says; nothing here affects layout, styling or behaviour, so you can
//  rewrite every string below without touching any component code.
//
//  `paragraphs` takes as many or as few entries as you like — add one, delete
//  one, reorder them. Each becomes its own paragraph in the dialog.
// ─────────────────────────────────────────────────────────────────────────────

const recollectionDoorCopy = {
  // Small gold line above the title.
  eyebrow: 'A personal devotional library',

  // The large serif heading.
  title: 'Recollection',

  // The body of the dialog. One string per paragraph.
  paragraphs: [
    `Yes — and this is the part of my life that doesn't fit on a CV. Recollection
     is my own collection of Catholic prayers, hymns, litanies, Scripture and
     saints, together with the reflections I write alongside them. I built it for
     myself; I keep it in the open rather than hidden.`,

    `The contents are explicitly religious and specifically Catholic throughout.
     You're very welcome in it whoever you are — and if that isn't what you came
     here for, no hard feelings at all. That's exactly why it's behind a door
     instead of on the front page.`,

    // The two paragraphs on the prayer collection and on the Saints now live
    // inside the app itself, as intro notes at the top of the Library and
    // Saints tabs — see best/faith/journal-app/index.html. They read as things
    // said once you're already in the room, not on the doorstep.
  ],

  // The two buttons.
  enterLabel: 'Come in',
  declineLabel: 'Not for me',

  // The small grey line at the very bottom.
  fineprint: `Opens a separate app. Nothing you do there is sent anywhere — it
    stays in your browser.`,

  // The label on the trigger itself, in the header and on the About page.
  triggerLabel: 'Are you Catholic?',
  triggerLabelInline: 'More on that →',
};

export default recollectionDoorCopy;
