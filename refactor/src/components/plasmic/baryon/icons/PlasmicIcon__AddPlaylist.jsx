// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function AddPlaylistIcon(props) {
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
          "M11.667 8.333A2.383 2.383 0 0010.833 5a19.327 19.327 0 01-2.5-2.5v12.083"
        }
        stroke={"currentColor"}
        strokeWidth={"1.6"}
        strokeLinecap={"round"}
        strokeLinejoin={"round"}
      ></path>

      <path
        d={
          "M11.667 12.5H17.5h-5.833zm2.5-8.333H17.5h-3.333zM15.833 2.5v3.333V2.5zm-4.166 13.333H17.5h-5.833zm-6.25-4.166a2.917 2.917 0 100 5.833 2.917 2.917 0 000-5.833v0z"
        }
        stroke={"currentColor"}
        strokeWidth={"1.6"}
        strokeLinecap={"round"}
        strokeLinejoin={"round"}
      ></path>
    </svg>
  );
}

export default AddPlaylistIcon;
/* prettier-ignore-end */
