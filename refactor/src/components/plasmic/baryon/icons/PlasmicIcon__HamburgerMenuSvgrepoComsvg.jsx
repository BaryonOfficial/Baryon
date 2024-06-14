// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function HamburgerMenuSvgrepoComsvgIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      viewBox={"0 0 24 24"}
      fill={"none"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        fillRule={"evenodd"}
        clipRule={"evenodd"}
        d={
          "M20.75 7a.75.75 0 01-.75.75H4a.75.75 0 010-1.5h16a.75.75 0 01.75.75zm0 5a.75.75 0 01-.75.75H4a.75.75 0 010-1.5h16a.75.75 0 01.75.75zm0 5a.75.75 0 01-.75.75H4a.75.75 0 010-1.5h16a.75.75 0 01.75.75z"
        }
        fill={"currentColor"}
      ></path>
    </svg>
  );
}

export default HamburgerMenuSvgrepoComsvgIcon;
/* prettier-ignore-end */
