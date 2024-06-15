// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function ArtIconIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 24 21"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        d={"M9 6.75a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"}
        fill={"currentColor"}
      ></path>

      <path
        d={
          "M3 0a3 3 0 00-3 3v15a3 3 0 003 3h18a3 3 0 003-3V3a3 3 0 00-3-3H3zm18 1.5A1.5 1.5 0 0122.5 3v9.75l-5.666-2.92a.75.75 0 00-.865.139l-5.565 5.565-3.99-2.658a.75.75 0 00-.945.093L1.5 16.5V3A1.5 1.5 0 013 1.5h18z"
        }
        fill={"currentColor"}
      ></path>
    </svg>
  );
}

export default ArtIconIcon;
/* prettier-ignore-end */
