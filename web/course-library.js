// Only Drive's official preview endpoint can become an iframe source.
export function drivePreviewUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.port || url.username || url.password) return null;
    const id = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)\/(?:view|preview)\/?$/)?.[1];
    if (!id) return null;
    const preview = new URL(`https://drive.google.com/file/d/${id}/preview`);
    const resourceKey = url.searchParams.get('resourcekey');
    if (resourceKey && /^[A-Za-z0-9_-]+$/.test(resourceKey)) preview.searchParams.set('resourcekey', resourceKey);
    return preview.href;
  } catch { return null; }
}

export function coursePosts(courses) {
  return courses.flatMap(course => course.weeks.map(({ week, url }) => ({
    id: `@class/${course.id}/week-${String(week).padStart(2, '0')}`,
    section: 'class', kind: 'pdf', course: course.title, courseId: course.id,
    title: `${week}주차`, pdfUrl: drivePreviewUrl(url), loaded: true,
  })));
}
