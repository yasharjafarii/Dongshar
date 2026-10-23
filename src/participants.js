export async function groupPeople(env, g) {
  return (
    await env.DB.prepare(
      "SELECT p.id,COALESCE(u.name,p.name) AS name,p.user_id,p.contact_id,p.added_by FROM group_participants p LEFT JOIN users u ON u.id=p.user_id WHERE p.group_id=? ORDER BY p.rowid",
    )
      .bind(g)
      .all()
  ).results;
}
export async function claimParticipant(env, g, userId) {
  // Preserve the guest ID in historical allocations when that same person later joins.
  const existing = await env.DB.prepare(
    "SELECT id FROM group_participants WHERE group_id=? AND user_id=?",
  )
    .bind(g, userId)
    .first();
  if (existing) return;
  await env.DB.prepare(
    `UPDATE group_participants SET user_id=? WHERE group_id=? AND id=(SELECT p.id FROM group_participants p JOIN personal_accounts a ON a.id=p.contact_id WHERE p.group_id=? AND p.user_id IS NULL AND ((p.added_by=a.owner AND a.peer_user_id=?) OR (p.added_by=a.peer_user_id AND a.owner=?)) ORDER BY p.rowid LIMIT 1)`,
  )
    .bind(userId, g, g, userId, userId)
    .run();
}
export async function addGroupFriend({
  env,
  g,
  user,
  group,
  b,
  one,
  stmt,
  fail,
  uid,
  audit,
  json,
}) {
  if (group.owner !== user.id)
    fail("فقط سازندهٔ گروه می‌تواند از فهرست دوستان عضو اضافه کند", 403);
  if (group.archived) fail("گروه بایگانی شده است");
  const a = await one(
    env,
    "SELECT * FROM personal_accounts WHERE id=? AND archived=0 AND (owner=? OR peer_user_id=?)",
    String(b.account_id),
    user.id,
    user.id,
  );
  if (!a) fail("دوست فعال در فهرست شما پیدا نشد", 404);
  const peer = a.owner === user.id ? a.peer_user_id : a.owner;
  const existing = await one(
    env,
    "SELECT * FROM group_participants WHERE group_id=? AND (contact_id=? OR (user_id IS NOT NULL AND user_id=?))",
    g,
    a.id,
    peer,
  );
  if (existing) {
    const changes = [
      stmt(
        env,
        "UPDATE group_participants SET removed=0,user_id=COALESCE(user_id,?) WHERE group_id=? AND id=?",
        peer,
        g,
        existing.id,
      ),
    ];
    if (peer)
      changes.push(
        stmt(
          env,
          "INSERT OR IGNORE INTO members(group_id,user_id) VALUES(?,?)",
          g,
          peer,
        ),
      );
    await env.DB.batch(changes);
    return json({ id: existing.id });
  }
  const count = await one(
    env,
    "SELECT COUNT(*) AS n FROM group_participants WHERE group_id=? AND removed=0",
    g,
  );
  if (count.n >= 100) fail("ظرفیت گروه تکمیل است");
  const name = peer
      ? (await one(env, "SELECT name FROM users WHERE id=?", peer)).name
      : a.name,
    id = peer || "guest:" + a.id;
  const batch = [
    stmt(
      env,
      "INSERT INTO group_participants(group_id,id,user_id,contact_id,added_by,name) VALUES(?,?,?,?,?,?)",
      g,
      id,
      peer || null,
      a.id,
      user.id,
      name,
    ),
  ];
  if (peer)
    batch.push(
      stmt(
        env,
        "INSERT OR IGNORE INTO members(group_id,user_id) VALUES(?,?)",
        g,
        peer,
      ),
    );
  batch.push(
    audit(env, g, user.id, `«${name}» را از فهرست دوستان به گروه اضافه کرد`),
  );
  await env.DB.batch(batch);
  return json({ id });
}
