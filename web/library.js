export function adjacentPosts(posts, id) {
  const current = posts.find(post => post.id === id);
  if (!current) return { previous: null, next: null };
  const folder = post => (post.path || post.id).split('/').slice(0, -1).join('/');
  const siblings = posts.filter(post => folder(post) === folder(current));
  const index = siblings.findIndex(post => post.id === id);
  return { previous: siblings[index - 1] || null, next: siblings[index + 1] || null };
}

export function buildTree(posts) {
  const root = { id: '', title: '', children: [], posts: [] };
  const folders = new Map([['', root]]);
  for (const post of posts) {
    let parent = root;
    const parts = (post.path || post.id).split('/').slice(0, -1);
    for (let depth = 0; depth < parts.length; depth++) {
      const id = parts.slice(0, depth + 1).join('/');
      if (!folders.has(id)) {
        const folder = { id, title: parts[depth], children: [], posts: [] };
        folders.set(id, folder); parent.children.push(folder);
      }
      parent = folders.get(id);
    }
    parent.posts.push(post);
  }
  return root;
}

export function filterTree(tree, query) {
  const needle = query.trim().normalize('NFC').toLocaleLowerCase();
  if (!needle) return tree;
  function visit(folder, ancestorMatched = false) {
    const matched = ancestorMatched || folder.title.normalize('NFC').toLocaleLowerCase().includes(needle);
    return { ...folder,
      posts: folder.posts.filter(post => matched || post.title.normalize('NFC').toLocaleLowerCase().includes(needle)),
      children: folder.children.map(child => visit(child, matched)).filter(child => child.posts.length || child.children.length),
    };
  }
  return visit(tree);
}
