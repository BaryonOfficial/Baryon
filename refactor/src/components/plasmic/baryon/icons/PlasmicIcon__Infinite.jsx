// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function InfiniteIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 24 24"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        d={
          "M19.91 14.64a3.74 3.74 0 01-5.27 0L12 12l2.64-2.64a3.73 3.73 0 015.27 5.28v0zm-15.82 0a3.74 3.74 0 005.27 0L12 12 9.36 9.36a3.73 3.73 0 10-5.27 5.28v0z"
        }
        stroke={"currentColor"}
        strokeWidth={"2"}
        strokeLinecap={"round"}
        strokeLinejoin={"round"}
      ></path>
    </svg>
  );
}

export default InfiniteIcon;
/* prettier-ignore-end */
