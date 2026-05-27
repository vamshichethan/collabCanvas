import {
  Canvas,
  Circle,
  FabricObject,
  IText,
  Line,
  Path,
  Rect,
  type TClassProperties,
} from 'fabric';
import type { WhiteboardObject, WhiteboardObjectType } from '../types';

type FabricWhiteboardObject = FabricObject & {
  whiteboardId?: string;
  whiteboardType?: WhiteboardObjectType;
  createdAt?: number;
};

const DEFAULT_STROKE = '#2563eb';

export const createObjectId = () => {
  if ('randomUUID' in crypto) return crypto.randomUUID();
  return `object-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const tagFabricObject = (
  object: FabricObject,
  type: WhiteboardObjectType,
  existing?: Pick<WhiteboardObject, 'id' | 'createdAt'>,
) => {
  const tagged = object as FabricWhiteboardObject;
  tagged.whiteboardId = existing?.id ?? tagged.whiteboardId ?? createObjectId();
  tagged.whiteboardType = type;
  tagged.createdAt = existing?.createdAt ?? tagged.createdAt ?? Date.now();
  object.set({ selectable: true, evented: true });
  return tagged;
};

const getType = (object: FabricObject): WhiteboardObjectType => {
  const taggedType = (object as FabricWhiteboardObject).whiteboardType;
  if (taggedType) return taggedType;
  if (object instanceof Rect) return 'rectangle';
  if (object instanceof Circle) return 'circle';
  if (object instanceof Line) return 'line';
  if (object instanceof IText) return 'text';
  return 'path';
};

const getScaledWidth = (object: FabricObject) => object.width * object.scaleX;
const getScaledHeight = (object: FabricObject) => object.height * object.scaleY;

export const createWhiteboardObject = (object: FabricObject): WhiteboardObject => {
  const type = getType(object);
  const tagged = tagFabricObject(object, type);
  const now = Date.now();
  const base = {
    id: tagged.whiteboardId ?? createObjectId(),
    type,
    x: object.left ?? 0,
    y: object.top ?? 0,
    strokeColor: String(object.stroke ?? DEFAULT_STROKE),
    fillColor: object.fill ? String(object.fill) : undefined,
    strokeWidth: Number(object.strokeWidth ?? 1),
    createdAt: tagged.createdAt ?? now,
    updatedAt: now,
  };

  if (object instanceof Rect) {
    return {
      ...base,
      width: getScaledWidth(object),
      height: getScaledHeight(object),
      fillColor: object.fill ? String(object.fill) : 'transparent',
    };
  }

  if (object instanceof Circle) {
    return {
      ...base,
      radius: object.radius * Math.max(object.scaleX, object.scaleY),
      fillColor: object.fill ? String(object.fill) : 'transparent',
    };
  }

  if (object instanceof Line) {
    return {
      ...base,
      points: {
        x1: object.x1,
        y1: object.y1,
        x2: object.x2,
        y2: object.y2,
      },
    };
  }

  if (object instanceof IText) {
    return {
      ...base,
      text: object.text ?? '',
      width: getScaledWidth(object),
      height: getScaledHeight(object),
      fillColor: object.fill ? String(object.fill) : DEFAULT_STROKE,
      strokeColor: String(object.fill ?? DEFAULT_STROKE),
      strokeWidth: 0,
    };
  }

  return {
    ...base,
    width: getScaledWidth(object),
    height: getScaledHeight(object),
    points: (object as Path).path ?? object.toObject().path,
    fillColor: undefined,
  };
};

export const serializeCanvas = (canvas: Canvas): WhiteboardObject[] =>
  canvas.getObjects().map((object) => createWhiteboardObject(object));

export const updateWhiteboardObject = (
  objects: WhiteboardObject[],
  updatedObject: WhiteboardObject,
): WhiteboardObject[] => {
  const index = objects.findIndex((object) => object.id === updatedObject.id);
  if (index === -1) return [...objects, updatedObject];

  const next = [...objects];
  next[index] = {
    ...objects[index],
    ...updatedObject,
    createdAt: objects[index].createdAt,
    updatedAt: Date.now(),
  };
  return next;
};

export const deleteWhiteboardObject = (objects: WhiteboardObject[], id: string): WhiteboardObject[] =>
  objects.filter((object) => object.id !== id);

export const createFabricObjectFromWhiteboardObject = (object: WhiteboardObject): FabricObject => {
  const common = {
    left: object.x,
    top: object.y,
    stroke: object.strokeColor,
    strokeWidth: object.strokeWidth,
    fill: object.fillColor ?? 'transparent',
  };

  if (object.type === 'rectangle') {
    return tagFabricObject(
      new Rect({
        ...common,
        width: object.width ?? 1,
        height: object.height ?? 1,
      }),
      object.type,
      object,
    );
  }

  if (object.type === 'circle') {
    return tagFabricObject(
      new Circle({
        ...common,
        radius: object.radius ?? 1,
      }),
      object.type,
      object,
    );
  }

  if (object.type === 'line') {
    const points = object.points as { x1?: number; y1?: number; x2?: number; y2?: number } | undefined;
    return tagFabricObject(
      new Line(
        [
          points?.x1 ?? object.x,
          points?.y1 ?? object.y,
          points?.x2 ?? object.x + (object.width ?? 1),
          points?.y2 ?? object.y + (object.height ?? 1),
        ],
        {
          stroke: object.strokeColor,
          strokeWidth: object.strokeWidth,
        },
      ),
      object.type,
      object,
    );
  }

  if (object.type === 'text') {
    return tagFabricObject(
      new IText(object.text ?? '', {
        left: object.x,
        top: object.y,
        fill: object.fillColor ?? object.strokeColor,
        fontFamily: 'Inter, sans-serif',
        fontSize: 28,
      }),
      object.type,
      object,
    );
  }

  const path = new Path((object.points as TClassProperties<Path>['path']) ?? [], {
    left: object.x,
    top: object.y,
    stroke: object.strokeColor,
    strokeWidth: object.strokeWidth,
    fill: '',
  });
  return tagFabricObject(path, object.type, object);
};

export const loadCanvasFromObjects = (canvas: Canvas, objects: WhiteboardObject[]) => {
  canvas.getObjects().forEach((object) => canvas.remove(object));
  objects.filter((object) => !object.deleted).forEach((object) => canvas.add(createFabricObjectFromWhiteboardObject(object)));
  canvas.discardActiveObject();
  canvas.requestRenderAll();
};

export const cloneWhiteboardObjects = (objects: WhiteboardObject[]) =>
  structuredClone(objects);
