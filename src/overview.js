import { balances, simplify } from "../public/ledger.js";

function indexBy(rows, key) {
  const index = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!index.has(value)) index.set(value, []);
    index.get(value).push(row);
  }
  return index;
}

// Aggregate identities by account/user IDs, never by display name.
export async function overview({ env, user, all }) {
  const [accounts, totals, participants, expenses, payments] =
    await Promise.all([
      all(
        env,
        "SELECT a.*,u.name owner_name,p.name peer_name FROM personal_accounts a JOIN users u ON u.id=a.owner LEFT JOIN users p ON p.id=a.peer_user_id WHERE a.owner=? OR a.peer_user_id=? ORDER BY a.created_at,a.id",
        user.id,
        user.id,
      ),
      all(
        env,
        "SELECT e.account_id,e.currency,SUM(e.owner_delta) n FROM personal_entries e JOIN personal_accounts a ON a.id=e.account_id WHERE e.deleted=0 AND (a.owner=? OR a.peer_user_id=?) GROUP BY e.account_id,e.currency",
        user.id,
        user.id,
      ),
      all(
        env,
        "SELECT p.*,COALESCE(u.name,p.name) display_name,g.name group_name,g.archived group_archived FROM group_participants p JOIN groups g ON g.id=p.group_id JOIN members m ON m.group_id=g.id AND m.user_id=? LEFT JOIN users u ON u.id=p.user_id",
        user.id,
      ),
      all(
        env,
        "SELECT e.id,e.group_id,e.amount,e.currency,e.allocations,e.payers FROM expenses e JOIN members m ON m.group_id=e.group_id AND m.user_id=? WHERE e.deleted=0",
        user.id,
      ),
      all(
        env,
        "SELECT s.group_id,s.sender,s.receiver,s.amount,s.currency FROM settlements s JOIN members m ON m.group_id=s.group_id AND m.user_id=? WHERE s.deleted=0",
        user.id,
      ),
    ]);
  const totalsByAccount = indexBy(totals, "account_id"),
    participantsByGroup = indexBy(participants, "group_id"),
    expensesByGroup = indexBy(expenses, "group_id"),
    paymentsByGroup = indexBy(payments, "group_id");
  const people = new Map(),
    accountKeys = new Map();
  function person(key, name) {
    if (!people.has(key))
      people.set(key, {
        id: key,
        name,
        balances: {},
        personal_balances: {},
        group_balances: {},
        accounts: [],
        groups: [],
        archived: true,
      });
    return people.get(key);
  }
  function add(target, values) {
    for (const [c, n] of Object.entries(values))
      target[c] = (target[c] || 0) + n;
  }
  for (const a of accounts) {
    const own = a.owner === user.id,
      peer = own ? a.peer_user_id : a.owner,
      key = peer ? "user:" + peer : "contact:" + a.id;
    accountKeys.set(a.id, key);
    const p = person(key, own ? a.name : a.owner_name),
      values = Object.fromEntries(
        (totalsByAccount.get(a.id) || []).map((t) => [
          t.currency,
          own ? t.n : -t.n,
        ]),
      );
    p.accounts.push({
      id: a.id,
      name: own ? a.name : a.owner_name,
      archived: !!a.archived,
      balances: values,
    });
    p.archived &&= !!a.archived;
    add(p.personal_balances, values);
    add(p.balances, values);
  }
  for (const [gid, ps] of participantsByGroup) {
    const self = ps.find((p) => p.user_id === user.id);
    if (!self) continue;
    const groupBalances = balances(
      (expensesByGroup.get(gid) || []).map((e) => ({
        ...e,
        allocations: JSON.parse(e.allocations),
        payers: JSON.parse(e.payers),
      })),
      paymentsByGroup.get(gid) || [],
    );
    const simplified = Object.fromEntries(
      Object.entries(groupBalances).map(([c, b]) => [c, simplify(b)]),
    );
    for (const member of ps) {
      if (member.id === self.id) continue;
      const key = member.user_id
          ? "user:" + member.user_id
          : accountKeys.get(member.contact_id) ||
            "contact:" + (member.contact_id || gid + ":" + member.id),
        values = {};
      for (const [c, b] of Object.entries(groupBalances))
        values[c] = simplified[c].reduce(
          (n, t) =>
            n +
            (t.receiver === self.id && t.sender === member.id
              ? t.amount
              : t.sender === self.id && t.receiver === member.id
                ? -t.amount
                : 0),
          0,
        );
      if (member.removed && !Object.values(values).some(Boolean)) continue;
      const p = person(key, member.display_name);
      p.archived = false;
      p.groups.push({
        id: gid,
        name: member.group_name,
        participant_id: member.id,
        archived: !!member.group_archived,
        balances: values,
      });
      add(p.group_balances, values);
      add(p.balances, values);
    }
  }
  return { people: [...people.values()] };
}
