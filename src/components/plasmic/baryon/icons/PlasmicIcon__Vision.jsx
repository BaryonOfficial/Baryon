// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function VisionIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 29 29"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        d={
          "M25.2 14.4s-3.6 7.2-10.8 7.2c-7.2 0-10.8-7.2-10.8-7.2s3.6-7.2 10.8-7.2c7.2 0 10.8 7.2 10.8 7.2zm-10.8 2.4a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8z"
        }
        stroke={"currentColor"}
        strokeWidth={"2.4"}
        strokeLinecap={"round"}
        strokeLinejoin={"round"}
      ></path>
    </svg>
  );
}

export default VisionIcon;
/* prettier-ignore-end */
