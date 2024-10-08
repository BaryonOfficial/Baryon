// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function CloseButtonIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      viewBox={"0 0 48 48"}
      data-name={"Layer 1"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <circle
        cx={"24"}
        cy={"24"}
        r={"23"}
        fill={"none"}
        stroke={"currentColor"}
        strokeLinecap={"round"}
        strokeLinejoin={"round"}
        strokeWidth={"2"}
      ></circle>

      <path
        fill={"none"}
        stroke={"currentColor"}
        strokeLinecap={"round"}
        strokeLinejoin={"round"}
        strokeWidth={"2"}
        d={"M12 12l24 24m-24 0l24-24"}
      ></path>
    </svg>
  );
}

export default CloseButtonIcon;
/* prettier-ignore-end */
