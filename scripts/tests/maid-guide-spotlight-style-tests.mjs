import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  calculateMaidSpotlightLayout,
  isMaidGuideMotionReduced,
  isMaidGuideTargetOutsideViewport,
} from '../../src/scripts/ui/maid-guide-spotlight.js';

const source = fs.readFileSync(
  new URL('../../src/scripts/ui/maid-guide-spotlight.js', import.meta.url),
  'utf8',
);

{
  assert.match(source, /z-index:\s*40000/);
  assert.match(source, /maid-spotlight-dim-top/);
  assert.match(source, /maid-spotlight-dim-bottom/);
  assert.match(source, /maid-spotlight-dim-left/);
  assert.match(source, /maid-spotlight-dim-right/);
  assert.match(source, /@keyframes\s+maid-spotlight-ring-pulse/);
  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(source, /body\[data-reduced-motion=['"]on['"]\]\s+\.maid-spotlight-root/);
  assert.match(source, /var\(--app-accent-primary/);
  assert.match(source, /var\(--app-success-text/);
  assert.match(source, /scrollIntoView\?\.\(/);
  assert.match(source, /index > 0 && typeof current\?\.onPrev === 'function'/);
  assert.match(source, /maid-spotlight-arrow/);
  assert.match(source, /maid-spotlight-escape-hint/);
  assert.match(source, /maid-spotlight-card-avatar-status/);
  assert.match(source, /overflow-y:\s*auto/);
  assert.match(source, /cardEl\?\.scrollHeight/);
  assert.match(source, /const applyCardBox/);
  assert.match(source, /element\.style\.height = 'auto'/);
  assert.doesNotMatch(source, /applyBox\(cardEl,\s*layout\.card\)/);
  assert.match(source, /maid-spotlight-card:not\(\.is-typed\)\s+\.maid-spotlight-text::after/);
  assert.match(
    source,
    /\.maid-spotlight-root\.is-tracking\s+\.maid-spotlight-dim,[\s\S]*?\.maid-spotlight-hole,[\s\S]*?\.maid-spotlight-arrow\s*\{[\s\S]*?transition:\s*opacity\s+180ms\s+ease/,
  );
  assert.match(source, /let firstGeometryRefresh = true/);
  assert.match(source, /root\?\.classList\?\.toggle\?\.\('is-tracking',\s*!firstGeometryRefresh\)/);
  assert.match(source, /firstGeometryRefresh = true;[\s\S]*?remove\?\.\('is-tracking'\)/);
  assert.match(source, /let initialResizeDelivery = true/);
  assert.match(source, /if \(initialResizeDelivery\)[\s\S]*?if \(!targetGeometryChanged\) return/);
  assert.match(source, /const TARGET_RESOLVE_GRACE_MS = 1000/);
  assert.match(source, /const TARGET_RESOLVE_RETRY_MS = 100/);
  assert.match(source, /const expectsTarget = current\.phase !== 'done' && Boolean\(String\(current\.step\?\.target/);
  assert.match(
    source,
    /expectsTarget && !target && Date\.now\(\) < targetResolveDeadline[\s\S]*?applyCardBox\(cardEl, lastLayout\.card\)[\s\S]*?scheduleTargetRetry\(\)[\s\S]*?return/,
  );
  assert.match(source, /if \(!expectsTarget \|\| target\) firstGeometryRefresh = false/);
  assert.ok((source.match(/clearTargetRetryTimer\(\);/g) || []).length >= 3);
  console.log('ok - maid spotlight keeps reference chrome, four-pane masking, app tokens, and dual reduced-motion channels');
}

{
  const desktop = calculateMaidSpotlightLayout({
    viewport: { w: 1200, h: 800 },
    targetRect: { left: 100, top: 100, width: 80, height: 40 },
    cardSize: { width: 384, height: 236 },
    placement: 'right',
  });
  assert.deepEqual(desktop.hole, { left: 90, top: 90, width: 100, height: 60 });
  assert.equal(desktop.placement, 'right');
  assert.ok(desktop.card.left >= desktop.hole.left + desktop.hole.width);

  const forcedBottomWithoutRoom = calculateMaidSpotlightLayout({
    viewport: { w: 1200, h: 800 },
    targetRect: { left: 520, top: 730, width: 100, height: 40 },
    cardSize: { width: 384, height: 236 },
    placement: 'bottom',
  });
  assert.equal(forcedBottomWithoutRoom.placement, 'top');
  assert.ok(
    forcedBottomWithoutRoom.card.top + forcedBottomWithoutRoom.card.height
      <= forcedBottomWithoutRoom.hole.top - 16,
    'a preferred side without room must flip instead of clamping across the target',
  );

  const mobile = calculateMaidSpotlightLayout({
    viewport: { w: 390, h: 640 },
    targetRect: { left: 330, top: 60, width: 40, height: 40 },
    cardSize: { width: 384, height: 236 },
    placement: 'right',
  });
  assert.equal(mobile.mobile, true);
  assert.equal(mobile.card.left, 12);
  assert.equal(mobile.card.width, 366);
  assert.ok(mobile.card.top + mobile.card.height <= 628);

  const mobileBottomTarget = calculateMaidSpotlightLayout({
    viewport: { w: 390, h: 640 },
    targetRect: { left: 120, top: 570, width: 150, height: 48 },
    cardSize: { width: 384, height: 236 },
    placement: 'top',
  });
  assert.equal(mobileBottomTarget.placement, 'top-fixed');
  assert.ok(
    mobileBottomTarget.card.top + mobileBottomTarget.card.height
      <= mobileBottomTarget.hole.top - 16,
    'mobile card must move above a bottom target',
  );
  console.log('ok - maid spotlight layout flips desktop sides and docks mobile cards away from their target');
}

{
  assert.equal(isMaidGuideMotionReduced({
    body: { dataset: { reducedMotion: 'on' } },
  }, () => ({ matches: false })), true);
  assert.equal(isMaidGuideMotionReduced({
    body: { dataset: {} },
  }, () => ({ matches: true })), true);
  assert.equal(isMaidGuideMotionReduced({
    body: { dataset: {} },
  }, () => ({ matches: false })), false);
  console.log('ok - maid spotlight JS motion check follows app and OS settings');
}

{
  const viewport = { w: 390, h: 640 };
  assert.equal(isMaidGuideTargetOutsideViewport({
    rect: { left: 20, top: 100, right: 120, bottom: 140 },
    viewport,
  }), false);
  assert.equal(isMaidGuideTargetOutsideViewport({
    rect: { left: 20, top: 700, right: 120, bottom: 740 },
    viewport,
  }), true);
  assert.equal(isMaidGuideTargetOutsideViewport({
    rect: { left: 10, top: -300, right: 380, bottom: 40 },
    viewport,
  }), false, 'partially visible composite targets should not force-scroll');
  console.log('ok - maid spotlight scrolls only targets that are fully outside the viewport');
}
