import test from 'node:test';
import assert from 'node:assert/strict';
import { courses } from '../web/courses.js';
import { coursePosts, drivePreviewUrl } from '../web/course-library.js';

const preview = 'https://drive.google.com/file/d/1pfNsVQ_15NM0uhr5D8CrXBCypo_MYJD2/preview';

test('all five courses contain fifteen independently configurable PDF weeks', () => {
  assert.equal(courses.length, 5);
  for (const course of courses) assert.deepEqual(course.weeks.map(item => item.week), Array.from({ length: 15 }, (_, i) => i + 1));
  const posts = coursePosts(courses);
  assert.equal(posts.length, 75);
  assert.equal(new Set(posts.map(post => post.id)).size, 75);
  for (const post of posts) {
    assert.equal(post.kind, 'pdf');
    assert.equal(post.pdfUrl, preview);
    assert.equal(post.loaded, true);
  }
  const custom = structuredClone(courses);
  custom[0].weeks[1].url = 'https://drive.google.com/file/d/another-file/preview';
  const changed = coursePosts(custom);
  assert.equal(changed[0].pdfUrl, preview);
  assert.equal(changed[1].pdfUrl, 'https://drive.google.com/file/d/another-file/preview');
  assert.equal(changed[15].pdfUrl, preview);
});

test('Drive links become official preview URLs without unsafe hosts or arbitrary iframe sources', () => {
  assert.equal(drivePreviewUrl(preview), preview);
  assert.equal(drivePreviewUrl(preview.replace('/preview', '/view?usp=sharing')), preview);
  assert.equal(drivePreviewUrl(preview + '?resourcekey=0-test&usp=sharing'), preview + '?resourcekey=0-test');
  for (const input of ['javascript:alert(1)', 'https://evil.example/file/d/test/view', 'https://drive.google.com.evil.example/file/d/test/view', 'https://user:pass@drive.google.com/file/d/test/view', 'https://drive.google.com/anything', 'http://drive.google.com/file/d/test/view', '', null]) assert.equal(drivePreviewUrl(input), null);
});
