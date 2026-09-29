// How the flowchart's notes speak. By default they are neutral ("the student", "the advisor"). A student sending the chart to an advisor
// wants first person ("my plan") and the real names of the people the guidance came from.
//
// The rule pack in the repository is public, so its sources are role-level ("BE undergraduate program director (email)") and no names
// belong in it. The names live in a personal file that is passed to the tool (keep it in .catalog-cache/personal/, which is gitignored):
//
//   { "firstPerson": true, "addressee": "Name",
//     "people": { "BE undergraduate program director": "Name", "EE program advisor": "Name (EE program)" } }
//
// `people` maps a role, exactly as it appears in a rule's source label before the parenthesis, to what the notes call that person.
// `addressee` is who the notes are written for (their title becomes "Notes for Name").

/** Splits "BE undergraduate program director (email)" into { role, medium }. */
const parseSource = label => {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(label || '');
  return m ? { role: m[1], medium: m[2] } : { role: label || '', medium: '' };
};

export function makeVoice(config = {}) {
  const firstPerson = config.firstPerson === true;
  const people = config.people || {};
  const roles = Object.keys(people).sort((a, b) => b.length - a.length);

  /** Rewrites a piece of text: role names become people's names and, in the first person, "the student" becomes "me" / "my". */
  const say = text => {
    let t = String(text);
    // "the BE undergraduate program director" -> "Pat": the article goes with the role
    for (const role of roles) t = t.replace(new RegExp(`(?:\\b[Tt]he )?${role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), people[role]);
    if (firstPerson) {
      t = t.replace(/\b(the|The) student's\b/g, (_, w) => (w === 'The' ? 'My' : 'my'))
        .replace(/\b(the|The) plan\b/g, (_, w) => (w === 'The' ? 'My plan' : 'my plan'))
        .replace(/\bthe student\b/g, 'me').replace(/\bThe student\b/g, 'I');
    }
    return t;
  };

  /** Who a rule came from, short: "Pat", "my understanding", or the role itself. */
  const who = rule => {
    const { role } = parseSource(rule.source.label);
    if (people[role]) return people[role];
    if (firstPerson && /^student report$/i.test(role)) return 'my understanding';
    return role;
  };
  /** The same with how it was given: "Pat, email". */
  const source = rule => {
    const { medium } = parseSource(rule.source.label);
    return medium ? `${who(rule)}, ${medium}` : who(rule);
  };

  return { firstPerson, people, addressee: config.addressee || null, say, who, source };
}
