// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function OpenBookIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 24 22"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        d={
          "M10.8 4.8v12.643a4.8 4.8 0 00-2.4-.643H1.2V1.2h6a3.6 3.6 0 013.6 3.6zm4.8 12a4.8 4.8 0 00-2.4.643V4.8a3.6 3.6 0 013.6-3.6h6v15.6h-7.2z"
        }
        stroke={"currentColor"}
        strokeWidth={"2.4"}
        strokeLinecap={"round"}
        strokeLinejoin={"round"}
      ></path>
    </svg>
  );
}

export default OpenBookIcon;
/* prettier-ignore-end */
