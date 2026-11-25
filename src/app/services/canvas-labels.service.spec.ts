import { TestBed } from '@angular/core/testing';
import {
  CanvasLabelsService,
  MAX_LABEL_PX,
  MIN_LABEL_PX,
  PreferredLabel,
} from './canvas-labels.service';
import { MechanismService } from './mechanism.service';
import { ObjectDisplayService } from './object-display.service';
import { SettingsService } from './settings.service';
import { RevJoint } from '../model/joint';
import { RealLink } from '../model/link';

describe('canvas typography', () => {
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 130, 0);
  let model: {
    solveRevision: number;
    mechanisms: { joints: RevJoint[][] }[];
    visibleJoints: () => RevJoint[];
  };
  let settings: { forceScale: number; drawingZoom: number; drawingScale: number };
  let labels: CanvasLabelsService;
  beforeEach(() => {
    model = { solveRevision: 1, mechanisms: [{ joints: [[a, b]] }], visibleJoints: () => [a, b] };
    settings = { forceScale: 1, drawingZoom: 1, drawingScale: 1 };
    TestBed.configureTestingModule({
      providers: [
        { provide: MechanismService, useValue: model },
        { provide: SettingsService, useValue: settings },
        { provide: ObjectDisplayService, useValue: {} },
      ],
    });
    labels = TestBed.inject(CanvasLabelsService);
  });
  it('keeps labels legible when a large drawing has a tiny object size', () => {
    expect(labels.modelFontSize()).toBe(130 / 55);
  });
  it('keeps model text proportions through thinner drawing styles', () => {
    settings.drawingZoom = 5;
    const before = labels.fontSize();
    settings.drawingScale = 0.48;
    expect(labels.fontSize()).toBe(before);
    expect(before * 5).toBeCloseTo(130 / 11, 6);
  });
  it('scales with the zoom between the readable limits, and holds outside them', () => {
    const pixels = (zoom: number) => {
      settings.drawingZoom = zoom;
      return labels.fontSize() * zoom;
    };
    expect(pixels(5)).toBeCloseTo(130 / 11, 6);
    expect(pixels(1)).toBeCloseTo(MIN_LABEL_PX, 1);
    expect(pixels(0.01)).toBeCloseTo(MIN_LABEL_PX, 0);
    expect(pixels(100)).toBeCloseTo(MAX_LABEL_PX, 0);
  });
  it('writes a long name smaller, down to the smallest readable size', () => {
    settings.drawingZoom = 6;
    const bar = new RealLink('CD', [new RevJoint('C', 0, 0), new RevJoint('D', 12, 0)]);
    const base = labels.fontSize();
    expect(labels.fontFor(bar, 'CD')).toBe(base);
    const long = labels.fontFor(bar, 'Long link');
    expect(long).toBeLessThan(base);
    expect(long * 6).toBeGreaterThan(MIN_LABEL_PX + 1);
    const longer = labels.fontFor(bar, 'Front coupling rod');
    expect(longer * 6).toBeCloseTo(MIN_LABEL_PX, 0);
  });
  it('sizes from the authored pose while animation changes the drawing extent', () => {
    model.visibleJoints = () => [new RevJoint('A', 0, 0), new RevJoint('B', 260, 0)];
    expect(labels.modelFontSize()).toBe(130 / 55);
    model.solveRevision++;
    expect(labels.modelFontSize()).toBe(130 / 55);
  });
  it('includes unsolved parts beside a solved mechanism', () => {
    model.visibleJoints = () => [a, b, new RevJoint('C', 325, 0)];
    expect(labels.modelFontSize()).toBe(325 / 55);
  });
});

describe('laying out every body name for one redraw', () => {
  const joints = ['A', 'B', 'C', 'D'].map((id, i) => new RevJoint(id, i * 40, (i % 2) * 15));
  const links = [0, 1, 2].map(
    (i) => new RealLink(joints[i].id + joints[i + 1].id, [joints[i], joints[i + 1]])
  );
  let nameLookups = 0;
  let labels: CanvasLabelsService;
  const preferred: PreferredLabel = (link, fontSize) => ({
    x: (link.joints[0].x + link.joints[1].x) / 2,
    y: (link.joints[0].y + link.joints[1].y) / 2,
    name: link.id,
    angle: 0,
    ink: 'black',
    opacity: 1,
    fontSize,
  });
  beforeEach(() => {
    nameLookups = 0;
    const model = {
      solveRevision: 1,
      mechanisms: [{ joints: [joints] }],
      forces: [],
      visibleJoints: () => joints,
      getLinks: () => links,
      visibleBodyName: (link: RealLink) => (nameLookups++, link.id),
      isPartInert: () => false,
      cylinderOfBar: () => undefined,
    };
    const flag = (value: boolean) => ({ value });
    const settings = {
      forceScale: 1,
      drawingZoom: 4,
      drawingScale: 1,
      isSchematic: false,
      drawingStyle: flag(false),
      isShowCOM: flag(false),
      isShowID: flag(false),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: MechanismService, useValue: model },
        { provide: SettingsService, useValue: settings },
        { provide: ObjectDisplayService, useValue: {} },
      ],
    });
    labels = TestBed.inject(CanvasLabelsService);
  });

  it('gives every body the label it would get asked alone', () => {
    const together = labels.forLinks(preferred, []);
    expect(together.map((one) => one.link)).toEqual(links);
    for (const { link, tag } of together) expect(tag).toEqual(labels.forLink(link, preferred, []));
  });

  it('builds the layout key once per pass, not once per body', () => {
    const arrange = vi.spyOn(labels as unknown as { arrange: () => void }, 'arrange');
    labels.forLinks(preferred, []);
    const firstPass = nameLookups;
    nameLookups = 0;
    labels.forLinks(preferred, []);
    expect(arrange).toHaveBeenCalledTimes(1);
    // One lookup a body for the key and one for each placed label: linear in
    // the bodies, where a key built per body cost one lookup per pair.
    expect(nameLookups).toBe(2 * links.length);
    expect(firstPass).toBeLessThan(links.length * links.length + 3 * links.length);
  });
});
