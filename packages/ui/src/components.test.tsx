import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";
import { Button } from "./button";
import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";

describe("shared UI states and controls", () => {
  it("renders a primary button with a safe default type", () => {
    const markup = renderToStaticMarkup(<Button>Continue</Button>);

    expect(markup).toContain('type="button"');
    expect(markup).toContain("Continue");
  });

  it("renders status labels as text", () => {
    const markup = renderToStaticMarkup(<Badge variant="success">Approved</Badge>);

    expect(markup).toContain("Approved");
    expect(markup).toContain("bg-[#e9f5ed]");
  });

  it("exposes loading and error messages to assistive technology", () => {
    const loading = renderToStaticMarkup(<LoadingState label="Loading meetings" />);
    const error = renderToStaticMarkup(<ErrorState description="Please try again." />);

    expect(loading).toContain('role="status"');
    expect(loading).toContain("Loading meetings");
    expect(error).toContain('role="alert"');
    expect(error).toContain("Please try again.");
  });
});
