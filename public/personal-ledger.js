// Positive balances mean the owner is owed money. A peer sees the exact opposite.
export function personalDelta(kind, amount, payer, ownerShare) {
  if (!["expense", "payment"].includes(kind))
    throw Error("نوع تراکنش نامعتبر است");
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1e12)
    throw Error("مبلغ نامعتبر است");
  if (!["owner", "peer"].includes(payer))
    throw Error("پرداخت‌کننده نامعتبر است");
  if (
    !Number.isSafeInteger(ownerShare) ||
    ownerShare < 0 ||
    ownerShare > amount
  )
    throw Error("سهم باید بین صفر و مبلغ کل باشد");
  return kind === "payment"
    ? payer === "owner"
      ? amount
      : -amount
    : (payer === "owner" ? amount : 0) - ownerShare;
}
export function personalEntry(entry, isOwner) {
  return {
    ...entry,
    my_delta: isOwner ? entry.owner_delta : -entry.owner_delta,
    my_share: isOwner ? entry.owner_share : entry.amount - entry.owner_share,
    paid_by: entry.payer === (isOwner ? "owner" : "peer") ? "self" : "friend",
  };
}
