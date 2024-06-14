// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function SkipBackStopIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 15 12"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        d={"M2 5.775L11.45.774v10.002L2 5.775z"}
        fill={"currentColor"}
      ></path>

      <path
        d={"M1 11.55V0"}
        stroke={"currentColor"}
        strokeWidth={"1.05"}
      ></path>
    </svg>
  );
}

export default SkipBackStopIcon;
/* prettier-ignore-end */
