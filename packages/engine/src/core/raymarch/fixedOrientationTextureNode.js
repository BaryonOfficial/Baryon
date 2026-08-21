import { TextureNode } from "three/webgpu";
import { int, nodeObject, textureSize } from "three/tsl";

/**
 * Texture node whose vertical orientation is fixed by the owning resource.
 *
 * Three's generic WebGL path carries a per-object boolean and branches at every
 * texture read because a TextureNode may be rebound between uploaded images and
 * render targets. Baryon's cache nodes never cross that boundary: observer and
 * bake textures are always render targets, while lookup tables are always data
 * textures. Specializing that immutable fact removes the runtime branch without
 * changing either backend's coordinates.
 */
class FixedOrientationTextureNode extends TextureNode {
  constructor(
    value,
    uvNode = null,
    levelNode = null,
    biasNode = null,
    flipYForWebGl = false,
    fixedTextureHeight = null,
  ) {
    super(value, uvNode, levelNode, biasNode);
    this.flipYForWebGl = flipYForWebGl;
    this.fixedTextureHeight = fixedTextureHeight;
  }

  setupUV(builder, uvNode) {
    if (!builder.isFlipY() || this.flipYForWebGl !== true) {
      return uvNode;
    }
    if (this.sampler) {
      return uvNode.flipY();
    }
    const textureHeight = Number.isInteger(this.fixedTextureHeight)
      ? int(this.fixedTextureHeight)
      : int(/** @type {any} */ (textureSize(this, this.levelNode)).y);
    return uvNode.setY(textureHeight.sub(uvNode.y).sub(1));
  }

  /** @returns {this} */
  clone() {
    const clone = new FixedOrientationTextureNode(
      this.value,
      this.uvNode,
      this.levelNode,
      this.biasNode,
      this.flipYForWebGl,
      this.fixedTextureHeight,
    );
    clone.sampler = this.sampler;
    clone.depthNode = this.depthNode;
    clone.compareNode = this.compareNode;
    clone.gradNode = this.gradNode;
    clone.gatherNode = this.gatherNode;
    /** @type {any} */ (clone).offsetNode = /** @type {any} */ (
      this
    ).offsetNode;
    return /** @type {this} */ (clone);
  }
}

function fixedOrientationTexture(
  value,
  uvNode = null,
  { flipYForWebGl = false, fixedTextureHeight = null } = {},
) {
  const sourceNode = value?.isTextureNode === true ? value : null;
  const textureNode = new FixedOrientationTextureNode(
    sourceNode ? sourceNode.value : value,
    uvNode,
    null,
    null,
    flipYForWebGl,
    fixedTextureHeight,
  );
  if (sourceNode) {
    textureNode.referenceNode = sourceNode.getBase();
  }
  return nodeObject(textureNode);
}

export function fixedRenderTargetTexture(value, uvNode = null) {
  return fixedOrientationTexture(value, uvNode, { flipYForWebGl: true });
}

export function fixedRenderTargetTextureLoad(value, texelNode) {
  return fixedRenderTargetTexture(value, texelNode).setSampler(false);
}

export function fixedRenderTargetTextureLoadAtKnownHeight(
  value,
  texelNode,
  textureHeight,
) {
  return fixedOrientationTexture(value, texelNode, {
    flipYForWebGl: true,
    fixedTextureHeight: textureHeight,
  }).setSampler(false);
}

export function fixedDataTexture(value, uvNode = null) {
  return fixedOrientationTexture(value, uvNode);
}

// Immutable cache-texture orientation owner end.
