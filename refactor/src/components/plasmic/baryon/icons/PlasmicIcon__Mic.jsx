// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function MicIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 20 20"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        d={
          "M15.2 13.333a6.666 6.666 0 01-10.4 0m5.2 2.5V17.5m0-5a3.333 3.333 0 01-3.333-3.333V5.833A3.333 3.333 0 0110 2.5v0a3.333 3.333 0 013.333 3.333v3.334A3.333 3.333 0 0110 12.5z"
        }
        stroke={"currentColor"}
        strokeWidth={"1.6"}
        strokeLinecap={"round"}
        strokeLinejoin={"round"}
      ></path>
    </svg>
  );
}

export default MicIcon;
/* prettier-ignore-end */
