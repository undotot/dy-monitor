import test from "node:test";
import assert from "node:assert/strict";
import { calculateUniformFocusLayout } from "../src/core/focus-uniform-layout.js";

const RATIO = 16 / 9;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const areaOf = (box) => box.width * box.height;
const planFor = (width, height, count, options = {}) => calculateUniformFocusLayout({ width, height, secondaryRatios: Array(count - 1).fill(RATIO), ...options });

test("8房中央上部主窗与等大小窗，主副窗显示框及视频均严格16:9", () => {
  const plan = planFor(2552,1177,8,{anchor:"center"});
  assert.equal(plan.position,"center");
  assert.ok(plan.leftCount>0);
  assert.ok(plan.rightCount>0);
  assert.equal(plan.leftCount+plan.rightCount+plan.bottomCount,7);
  close(plan.main.x + plan.main.width / 2, 2552 / 2);
  close(plan.main.y,plan.offsetY);
  assert.ok(plan.videoViewportFillRatio > 0.84);
  close(plan.main.width/plan.main.height,RATIO);
  close(plan.mainVideo.width,plan.main.width);
  close(plan.mainVideo.height,plan.main.height);
  for (const room of plan.placements) {
    close(room.width,plan.cell.width);
    close(room.height,plan.cell.height);
  }
  const left = planFor(2552,1177,8,{anchor:"left"});
  close(left.main.x,left.offsetX);
  assert.equal(left.leftCount,0);
  assert.ok(left.videoViewportFillRatio > 0.93);
});

test("1～16房两种主窗位置、多尺寸全部副窗等大且不重叠不越界", () => {
  for (const [width,height] of [[2552,1177],[1280,720],[1280,669],[729,780],[375,600],[150,120],[800,220]]) {
    for (let count=1;count<=16;count++) for (const anchor of ["auto","left","center"]) {
      const plan=planFor(width,height,count,{anchor});
      const tag=`${width}×${height}/${count}/${anchor}`;
      assert.ok(plan,tag);
      assert.equal(plan.placements.length,count-1);
      if (anchor==="left") close(plan.main.x,plan.offsetX);
      if (anchor==="center") close(plan.main.x+plan.main.width/2,width/2);
      const boxes=[plan.main,...plan.placements];
      for (const [index,box] of boxes.entries()) {
        assert.ok(box.width>0&&box.height>0&&box.x>=-1e-6&&box.y>=-1e-6&&box.x+box.width<=width+1e-6&&box.y+box.height<=height+1e-6,tag);
        for(const other of boxes.slice(index+1)) assert.ok(box.x+box.width<=other.x+1e-6||other.x+other.width<=box.x+1e-6||box.y+box.height<=other.y+1e-6||other.y+other.height<=box.y+1e-6,tag);
      }
      for(const room of plan.placements) {close(room.width,plan.cell.width);close(room.height,plan.cell.height);}
      for(const frame of [{...plan.main,video:plan.mainVideo},...plan.placements]) {
        close(frame.width/frame.height,RATIO);
        close(frame.video.width/frame.video.height,RATIO);
        close(frame.video.width,frame.width);
        close(frame.video.height,frame.height);
        assert.ok(frame.video.width<=frame.width+1e-6&&frame.video.height<=frame.height+1e-6,tag);
      }
      const videoArea=areaOf(plan.mainVideo)+plan.placements.reduce((sum,room)=>sum+areaOf(room.video),0);
      close(plan.videoViewportFillRatio,videoArea/(width*height));
      assert.ok(plan.videoViewportFillRatio<=plan.viewportFillRatio+1e-6);
    }
  }
});

test("源视频比例独立、主窗仍突出，重复布局及1px变化保持稳定", () => {
  const ratios=[9/16,4/3,1,16/9,2,0,Infinity];
  const mixed=planFor(1920,1080,8,{mainRatio:9/16,secondaryRatios:ratios});
  close(mixed.mainVideo.width/mixed.mainVideo.height,9/16);
  for(const room of mixed.placements)close(room.video.width/room.video.height,room.index<5?ratios[room.index]:RATIO);
  const original=planFor(2552,1177,8,{anchor:"center"});
  const repeat=planFor(2552,1177,8,{anchor:"center",previous:original.signature});
  assert.deepEqual(repeat,original);
  const changed=planFor(2552,1178,8,{anchor:"center",previous:original.signature});
  assert.equal(changed.signature,original.signature);
  assert.equal(planFor(0,0,8),null);
  assert.equal(planFor(1280,720,17),null);
});
