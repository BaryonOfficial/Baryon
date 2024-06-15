// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function XCircleFillIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 30 30"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <g clipPath={"url(#emHYnzCOOQfza)"}>
        <path
          d={
            "M30 15a15 15 0 11-30 0 15 15 0 0130 0zM10.039 8.711A.939.939 0 008.71 10.04L13.674 15l-4.963 4.961a.94.94 0 001.328 1.328L15 16.326l4.961 4.963a.939.939 0 001.328-1.328L16.326 15l4.963-4.961A.939.939 0 0019.96 8.71L15 13.674l-4.961-4.963z"
          }
          fill={"currentColor"}
        ></path>
      </g>

      <defs>
        <clipPath id={"emHYnzCOOQfza"}>
          <path fill={"currentColor"} d={"M0 0h30v30H0z"}></path>
        </clipPath>
      </defs>
    </svg>
  );
}

export default XCircleFillIcon;
/* prettier-ignore-end */
