'use client';

import { useForm } from '@formspree/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm as useHookForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';

const formSchema = z.object({
  name: z.string().min(2, { message: 'Name is required.' }),
  email: z.string().email({ message: 'Valid email is required.' }),
  phone: z.string().optional(),
});

export function SignUpForm() {
  const [formspreeState, handleFormspreeSubmit] = useForm('xzzpprdb');
  const form = useHookForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
    },
  });

  function onSubmit(values) {
    handleFormspreeSubmit(values);
  }

  if (formspreeState.succeeded) {
    return <p className="text-center p-4">Thanks for joining!</p>;
  }

  return (
    <div className="dark">
      {' '}
      {/* Wrap the entire component in a dark mode container */}
      <Card className="w-[350px]">
        <CardHeader className="text-center">
          <CardTitle>Get Notified on Launch</CardTitle>
          <CardDescription>Sign up for our plugin waitlist.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <Label htmlFor="name">Name</Label>
                    <FormControl>
                      <Input id="name" placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <Label htmlFor="phone">Phone Number</Label>
                    <FormControl>
                      <Input id="phone" type="tel" placeholder="+1 (203) 456-7890" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <Label htmlFor="email">Email</Label>
                    <FormControl>
                      <Input id="email" type="email" placeholder="johndoe@gmail.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </CardContent>
        <CardFooter>
          <Button
            className="w-full"
            onClick={form.handleSubmit(onSubmit)}
            disabled={formspreeState.submitting}>
            Submit
          </Button>
        </CardFooter>
        <div className="px-6 pb-6">
          <p className="text-xs text-center">
            By submitting this form you agree to sign up to our plugin waitlist and receive
            marketing communications.
          </p>
        </div>
      </Card>
    </div>
  );
}
