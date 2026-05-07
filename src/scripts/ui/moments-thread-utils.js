export const buildMomentThreadedComments = (comments = []) => {
  const list = Array.isArray(comments) ? comments.filter(Boolean) : [];
  const byId = new Map();
  list.forEach((comment) => {
    const id = String(comment?.id || '').trim();
    if (id) byId.set(id, comment);
  });
  const repliesByParent = new Map();
  const roots = [];
  for (const comment of list) {
    const replyTo = String(comment?.replyTo || '').trim();
    if (replyTo && byId.has(replyTo)) {
      if (!repliesByParent.has(replyTo)) repliesByParent.set(replyTo, []);
      repliesByParent.get(replyTo).push(comment);
    } else {
      roots.push(comment);
    }
  }
  return { roots, repliesByParent, byId };
};
