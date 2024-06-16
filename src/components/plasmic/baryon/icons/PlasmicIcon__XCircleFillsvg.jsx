// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function XCircleFillsvgIcon(props) {
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

      <g clipPath={"url(#Cc_e3tXrEq41a)"}>
        <path
          d={
            "M30 15a15 15 0 11-30 0 15 15 0 0130 0zM10.039 8.711A.938.938 0 108.71 10.04L13.674 15l-4.963 4.961a.938.938 0 101.328 1.328L15 16.326l4.961 4.963a.936.936 0 001.328 0 .936.936 0 000-1.328L16.326 15l4.963-4.961a.936.936 0 000-1.328.938.938 0 00-1.328 0L15 13.674l-4.961-4.963z"
          }
          fill={"currentColor"}
        ></path>
      </g>

      <defs>
        <clipPath id={"Cc_e3tXrEq41a"}>
          <path fill={"currentColor"} d={"M0 0h30v30H0z"}></path>
        </clipPath>
      </defs>
    </svg>
  );
}

export default XCircleFillsvgIcon;
/* prettier-ignore-end */
