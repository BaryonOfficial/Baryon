// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function LayerBlur3Icon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 51 42"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <g opacity={".32"} filter={"url(#CqLKCaaa-LL7a)"}>
        <ellipse
          cx={"25.827"}
          cy={"20.852"}
          rx={"18.827"}
          ry={"13.852"}
          fill={"currentColor"}
        ></ellipse>
      </g>

      <defs>
        <filter
          id={"CqLKCaaa-LL7a"}
          x={".688"}
          y={".688"}
          width={"50.279"}
          height={"40.329"}
          filterUnits={"userSpaceOnUse"}
          colorInterpolationFilters={"sRGB"}
        >
          <feFlood floodOpacity={"0"} result={"BackgroundImageFix"}></feFlood>

          <feBlend
            in={"SourceGraphic"}
            in2={"BackgroundImageFix"}
            result={"shape"}
          ></feBlend>

          <feGaussianBlur
            stdDeviation={"3.156"}
            result={"effect1_foregroundBlur_484_213"}
          ></feGaussianBlur>
        </filter>
      </defs>
    </svg>
  );
}

export default LayerBlur3Icon;
/* prettier-ignore-end */
