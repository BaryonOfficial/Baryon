// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function StopButtonsvg3Icon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 34 34"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <g clipPath={"url(#QEnEBxXAGIJea)"} filter={"url(#QEnEBxXAGIJeb)"}>
        <g filter={"url(#QEnEBxXAGIJec)"}>
          <circle cx={"16.8"} cy={"16.8"} r={"16.8"} fill={"#fff"}></circle>
        </g>

        <rect
          x={"7.72"}
          y={"7.36"}
          width={"18.16"}
          height={"18.88"}
          rx={"3.2"}
          fill={"#000"}
        ></rect>
      </g>

      <defs>
        <filter
          id={"QEnEBxXAGIJeb"}
          x={"0"}
          y={"0"}
          width={"33.6"}
          height={"37.8"}
          filterUnits={"userSpaceOnUse"}
          colorInterpolationFilters={"sRGB"}
        >
          <feFlood floodOpacity={"0"} result={"BackgroundImageFix"}></feFlood>

          <feBlend
            mode={"normal"}
            in={"SourceGraphic"}
            in2={"BackgroundImageFix"}
            result={"shape"}
          ></feBlend>

          <feColorMatrix
            in={"SourceAlpha"}
            type={"matrix"}
            values={"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"}
            result={"hardAlpha"}
          ></feColorMatrix>

          <feOffset dy={"4.2"}></feOffset>

          <feGaussianBlur stdDeviation={"2.1"}></feGaussianBlur>

          <feComposite
            in2={"hardAlpha"}
            operator={"arithmetic"}
            k2={"-1"}
            k3={"1"}
          ></feComposite>

          <feColorMatrix
            type={"matrix"}
            values={"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"}
          ></feColorMatrix>

          <feBlend
            mode={"normal"}
            in2={"shape"}
            result={"effect1_innerShadow_198_1229"}
          ></feBlend>
        </filter>

        <filter
          id={"QEnEBxXAGIJec"}
          x={"-4.2"}
          y={"0"}
          width={"42"}
          height={"42"}
          filterUnits={"userSpaceOnUse"}
          colorInterpolationFilters={"sRGB"}
        >
          <feFlood floodOpacity={"0"} result={"BackgroundImageFix"}></feFlood>

          <feColorMatrix
            in={"SourceAlpha"}
            type={"matrix"}
            values={"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"}
            result={"hardAlpha"}
          ></feColorMatrix>

          <feOffset dy={"4.2"}></feOffset>

          <feGaussianBlur stdDeviation={"2.1"}></feGaussianBlur>

          <feComposite in2={"hardAlpha"} operator={"out"}></feComposite>

          <feColorMatrix
            type={"matrix"}
            values={"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"}
          ></feColorMatrix>

          <feBlend
            mode={"normal"}
            in2={"BackgroundImageFix"}
            result={"effect1_dropShadow_198_1229"}
          ></feBlend>

          <feBlend
            mode={"normal"}
            in={"SourceGraphic"}
            in2={"effect1_dropShadow_198_1229"}
            result={"shape"}
          ></feBlend>
        </filter>

        <clipPath id={"QEnEBxXAGIJea"}>
          <path fill={"#fff"} d={"M0 0h33.6v33.6H0z"}></path>
        </clipPath>
      </defs>
    </svg>
  );
}

export default StopButtonsvg3Icon;
/* prettier-ignore-end */
